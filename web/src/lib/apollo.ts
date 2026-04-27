import { ApolloClient, InMemoryCache, HttpLink } from '@apollo/client';

/**
 * Apollo clients for the two subgraphs this dApp talks to.
 *
 * We create two separate clients rather than a single global default, so that
 * individual useQuery() calls can target the right endpoint via the `client`
 * option — e.g. `useQuery(QUERY, { client: usdcClient })`.
 */

const usdcUri =
  process.env.NEXT_PUBLIC_USDC_SUBGRAPH_URL ||
  // Fallback to a placeholder that will clearly fail rather than silently hitting the wrong endpoint.
  'https://gateway.thegraph.com/api/REPLACE_ME/subgraphs/id/REPLACE_ME';

const aaveUri =
  process.env.NEXT_PUBLIC_AAVE_SUBGRAPH_URL ||
  'https://gateway.thegraph.com/api/REPLACE_ME/subgraphs/id/Fip1BrKTKNwpTeGbUjvmogfQP8VPrjD9qYe9n4dgaNyi';

export const usdcClient = new ApolloClient({
  link: new HttpLink({ uri: usdcUri }),
  cache: new InMemoryCache(),
});

export const aaveClient = new ApolloClient({
  link: new HttpLink({ uri: aaveUri }),
  cache: new InMemoryCache(),
});
