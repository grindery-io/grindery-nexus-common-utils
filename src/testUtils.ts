import net from "node:net";

const checkAvailablePort = (options: net.ListenOptions = { host: "127.0.0.1", port: 0 }): Promise<number> =>
  new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);

    server.listen(options, () => {
      const { port } = server.address() as net.AddressInfo;
      server.close(() => {
        resolve(port);
      });
    });
  });

export async function getPort() {
  return await checkAvailablePort();
}
