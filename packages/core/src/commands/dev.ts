import {Server} from '../server/Server';

export async function dev() {
  const server = new Server();
  server.listen(4000, (address: string) => {
    console.log(`listening on ${address}`);
  });
}
