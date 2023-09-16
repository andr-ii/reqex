import * as http from 'http';
import * as fs from 'fs';
import { reqex } from './reqex';
import { v } from 'vator';
import { AddressInfo } from 'net';
import { ErrorMessage } from './types';

interface CreateServerOptions {
  status?: number;
  contentType?: string;
  body?: unknown;
  fails?: number;
}

const createTestServer = (options: CreateServerOptions = {}) => {
  const {
    status = 200,
    contentType = 'application/json',
    body = { data: 'some data' },
    fails = 0,
  } = options;
  return new Promise<{ server: http.Server; url: string }>((res) => {
    let failRequest = fails;
    const server = http.createServer((_, res) => {
      if (failRequest > 0) {
        res.destroy();
        failRequest -= 1;
      }

      const jsonBody = body != null ? JSON.stringify(body) : '';
      const headers = {
        'content-type': contentType,
        ...(body == null ? {} : { 'content-length': jsonBody.length }),
      };

      res.writeHead(status, headers);

      body == null ? res.end() : res.end(jsonBody);
    });

    server.listen(0, () => {
      res({
        server,
        url: `http://localhost:${(server.address() as AddressInfo)?.port}`,
      });
    });
  });
};

describe('error handling', () => {
  it('throws and error if request is not going to be http(s)', async () => {
    expect.assertions(1);

    try {
      await reqex.get('ftp://localhost:3000');
    } catch (error) {
      expect(error.message).toStrictEqual('Unsupported protocol: ftp');
    }
  });

  it('throws and error and calls catch', async () => {
    expect.assertions(1);

    await reqex.get('ftp://localhost:3000').catch((error) => {
      expect(error.message).toStrictEqual(
        `${ErrorMessage.UNSUPPORTED_PROTOCOL} ftp`,
      );
    });
  });

  it('throws and error if retry option interval is not valid', async () => {
    expect.assertions(1);

    try {
      await reqex
        .get('ftp://localhost:3000')
        .retry({ attempts: 2, interval: -1 });
    } catch (error) {
      expect(error.message).toStrictEqual(ErrorMessage.MIN_INTERVAL);
    }
  });

  it('throws and error if retry option attempts is not valid', async () => {
    expect.assertions(1);

    try {
      await reqex.get('ftp://localhost:3000').retry({ attempts: -2 });
    } catch (error) {
      expect(error.message).toStrictEqual(ErrorMessage.MIN_RETRY_ATTEMPTS);
    }
  });

  it('throws and error if request validation fails', async () => {
    expect.assertions(1);
    const { server, url } = await createTestServer({
      contentType: 'application/json',
      body: { company: 'my-company' },
    });

    try {
      await reqex.get(url).validate({ name: v.string });
    } catch (error) {
      expect(error.message).toStrictEqual(
        // eslint-disable-next-line quotes
        "Validation failed: key 'name' is missing, but 'string' type is required.",
      );
    }

    server.close();
  });

  it('throws an error if expected json but received text/html', async () => {
    expect.assertions(1);

    const { server, url } = await createTestServer({
      contentType: 'text/html',
      body: '<p>html response</p>',
    });

    try {
      await reqex.get(url).validate({ name: v.string });
    } catch (error) {
      expect(error.message).toStrictEqual(ErrorMessage.INVALID_CONTENT_TYPE);
    }

    server.close();
  });
});

describe('reqex test', () => {
  it('makes get request', async () => {
    expect.assertions(2);

    const { server, url } = await createTestServer();

    const response = await reqex.get(url).validate({ data: v.string });

    expect(response.json).not.toBeUndefined();
    expect(response.json.data).toStrictEqual('some data');

    server.close();
  });

  it('makes get request with valid headers', async () => {
    expect.assertions(2);

    const { server, url } = await createTestServer();

    const response = await reqex
      .get(url)
      .headers({ 'accept-language': 'ENG' })
      .validate({ data: v.string });

    expect(response.json).not.toBeUndefined();
    expect(response.json.data).toStrictEqual('some data');

    server.close();
  });

  it('makes post request', async () => {
    expect.assertions(2);

    const { server, url } = await createTestServer({
      status: 201,
      body: { created: 'success' },
    });

    const response = await reqex
      .post(url)
      .body({ data: 'some-data' })
      .validate({ created: v.string });

    expect(response.json).not.toBeUndefined();
    expect(response.json.created).toStrictEqual('success');

    server.close();
  });

  it('makes put request', async () => {
    expect.assertions(2);

    const { server, url } = await createTestServer({
      status: 200,
      body: { updated: 'success' },
    });

    const response = await reqex
      .put(url)
      .body({ data: 'some-data' })
      .validate({ updated: v.string });

    expect(response.json).not.toBeUndefined();
    expect(response.json.updated).toStrictEqual('success');

    server.close();
  });

  it('makes delete request', async () => {
    expect.assertions(3);

    const { server, url } = await createTestServer({
      status: 204,
      body: null,
    });

    const response = await reqex.delete(url).body({ data: 'some-data' });

    expect(response.json).toBeUndefined();
    expect(response.status).toStrictEqual(204);
    expect(response.contentLength).toStrictEqual(0);

    server.close();
  });

  it('makes get request and changes value with finally', async () => {
    expect.assertions(3);

    const { server, url } = await createTestServer();

    const response = await reqex
      .get(url)
      .validate({ data: v.string })
      .finally(() => expect(1).toStrictEqual(1));

    expect(response.json).not.toBeUndefined();
    expect(response.json.data).toStrictEqual('some data');

    server.close();
  });

  it('makes get request with retries', async () => {
    expect.assertions(2);

    const { server, url } = await createTestServer({ fails: 2 });

    const response = await reqex
      .get(url)
      .retry({ attempts: 3, interval: 1, logOnRetry: true })
      .validate({ data: v.string });

    expect(response.json).not.toBeUndefined();
    expect(response.json.data).toStrictEqual('some data');

    server.close();
  });

  it('makes get request with retries and does not log', async () => {
    expect.assertions(2);

    const { server, url } = await createTestServer({ fails: 2 });

    const response = await reqex
      .get(url)
      .retry({ attempts: 3, interval: 1, logOnRetry: false })
      .validate({ data: v.string });

    expect(response.json).not.toBeUndefined();
    expect(response.json.data).toStrictEqual('some data');

    server.close();
  });

  it('pipes response to the stream and overrides retry logic', async () => {
    expect.assertions(2);

    const stream = fs.createWriteStream('./test.log');

    jest
      .spyOn(fs.WriteStream.prototype, 'write')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .mockImplementation((() => {}) as any);

    const { server, url } = await createTestServer();

    const response = await reqex
      .get(url)
      .pipe(stream)
      .retry({ attempts: 3, interval: 1, logOnRetry: true })
      .validate({ data: v.string });

    expect(response.json).not.toBeUndefined();
    expect(response.json.data).toStrictEqual('some data');

    server.close();
  });
});
