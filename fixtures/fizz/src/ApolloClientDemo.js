const {
  ApolloClient,
  ApolloProvider,
  InMemoryCache,
  useSuspenseQuery,
  Observable,
} = require('@apollo/client');
const {print} = require('graphql');
const {canonicalStringify} = require('@apollo/client/cache');
const React = require('react');
const gql = require('graphql-tag');

function getQueryManager(client) {
  return client['queryManager'];
}

class NextSSRInMemoryCache extends InMemoryCache {
  constructor(config) {
    super(config);
    this.onIncomingResult = undefined;
  }
  /**
   * If on the server, a query result is written,
   * we want to also transport that to the browser.
   */
  write(options) {
    if (this.onIncomingResult) {
      this.onIncomingResult(options);
    }
    return super.write(options);
  }
}

class NextSSRApolloClient extends ApolloClient {
  constructor() {
    super(...arguments);
    this.simulatedStreamingQueries = new Map();
    this.onRequest = undefined;
    this.waitForPromise = undefined;
  }

  /**
   * internal helper function
   */
  identifyUniqueQuery(options) {
    const transformedDocument = this.documentTransform.transformDocument(
      options.query
    );
    const queryManager = getQueryManager(this);
    // Calling `transformDocument` will add __typename but won't remove client
    // directives, so we need to get the `serverQuery`.
    const {serverQuery} = queryManager.getDocumentInfo(transformedDocument);
    if (!serverQuery) {
      throw new Error('could not identify unique query');
    }
    const canonicalVariables = canonicalStringify(options.variables || {});
    const cacheKey = [print(serverQuery), canonicalVariables].toString();
    return {query: serverQuery, cacheKey, varJson: canonicalVariables};
  }

  /**
   * Simulates an "ongoing query" while the server is still fetching data,
   * so we utilize query deduplication in the browser to prevent the same
   * query from being repeated in the browser.
   */
  onIncomingStartedQuery(options) {
    const {query, varJson, cacheKey} = this.identifyUniqueQuery(options);
    if (!query) return;
    const printedServerQuery = print(query);
    console.log('[Apollo Client] simulating query start', options);
    const queryManager = getQueryManager(this);
    const byVariables =
      queryManager['inFlightLinkObservables'].get(printedServerQuery) ||
      new Map();
    queryManager['inFlightLinkObservables'].set(
      printedServerQuery,
      byVariables
    );
    if (!byVariables.has(varJson)) {
      let simulatedStreamingQuery, observable, fetchCancelFn;
      const cleanup = () => {
        if (queryManager['fetchCancelFns'].get(cacheKey) === fetchCancelFn)
          queryManager['fetchCancelFns'].delete(cacheKey);
        if (byVariables.get(varJson) === observable)
          byVariables.delete(varJson);
        if (
          this.simulatedStreamingQueries.get(cacheKey) ===
          simulatedStreamingQuery
        )
          this.simulatedStreamingQueries.delete(cacheKey);
      };
      const promise = new Promise((resolve, reject) => {
        this.simulatedStreamingQueries.set(
          cacheKey,
          (simulatedStreamingQuery = {resolve, reject, options})
        );
      });
      promise.finally(cleanup);
      byVariables.set(
        varJson,
        (observable = new Observable(observer => {
          promise
            .then(result => {
              observer.next(result);
              observer.complete();
            })
            .catch(err => {
              observer.error(err);
            });
        }))
      );
      queryManager['fetchCancelFns'].set(
        cacheKey,
        (fetchCancelFn = reason => {
          var _a;
          const {reject} =
            (_a = this.simulatedStreamingQueries.get(cacheKey)) !== null &&
            _a !== void 0
              ? _a
              : {};
          if (reject) {
            reject(reason);
          }
          cleanup();
        })
      );
    }
  }

  /**
   * Once we get a query result from the server, we resolve our fake
   * "ongoing query" and components relying on that can finally render.
   */
  onIncomingResult(data) {
    console.log('[Apollo Client] simulating query result', data);
    var _a;
    const {cacheKey} = this.identifyUniqueQuery(data);
    const {resolve} =
      (_a = this.simulatedStreamingQueries.get(cacheKey)) !== null &&
      _a !== void 0
        ? _a
        : {};
    if (resolve) {
      resolve({
        data: data.result,
      });
    }
    // In order to avoid a scenario where the promise resolves without
    // a query subscribing to the promise, we immediately call
    // `cache.write` here.
    // For more information, see: https://github.com/apollographql/apollo-client-nextjs/pull/38/files/388813a16e2ac5c62408923a1face9ae9417d92a#r1229870523
    this.cache.write(data);
  }

  /**
   * Override `watchQuery` so we can intercept the query during SSR
   * and transport the information that the query started to the browser.   *
   */
  watchQuery(options) {
    if (this.onRequest) {
      if (
        options.fetchPolicy !== 'cache-only' &&
        options.fetchPolicy !== 'standby'
      ) {
        this.onRequest(options);
      }
    }
    const result = super.watchQuery(options);

    if (this.waitForPromise) {
      // keep connection open while queries are in flight,
      // so we will always transport their results
      this.waitForPromise(
        new Promise(resolve => {
          result.subscribe({
            complete() {
              resolve({});
            },
            error() {
              resolve({});
            },
          });
        })
      );
    }
    return result;
  }
}

function StreamingProvider({children}) {
  const [client] = React.useState(
    new NextSSRApolloClient({
      uri: 'https://graphql-pokeapi.graphcdn.app/',
      cache: new NextSSRInMemoryCache(),
    })
  );
  const dispatchQueryStart = React.useActionChannel(options => {
    if (typeof window !== 'undefined') {
      client.onIncomingStartedQuery(options);
    }
  });
  const dispatchQueryResult = React.useActionChannel(data => {
    if (typeof window !== 'undefined') {
      client.onIncomingResult(data);
    }
  });
  const waitForPromise = React.useActionChannel(() => {});
  if (typeof window === 'undefined') {
    client.onRequest = dispatchQueryStart;
    client.waitForPromise = waitForPromise;
    client.cache.onIncomingResult = dispatchQueryResult;
  }

  return React.createElement(ApolloProvider, {client}, children);
}

function ApolloClientDemo() {
  return React.createElement(
    'div',
    null,
    'Apollo Client Demo',
    React.createElement(
      StreamingProvider,
      null,
      React.createElement(
        React.Suspense,
        null,
        React.createElement(DataFetchingComponent, null)
      )
    )
  );
}

// the `gql` tag is not available in the browser in this bundling setup, so I do it manually here
// gql`
//   query GetPokemonByName($name: String!) {
//     pokemon(name: $name) {
//       id
//       name
//     }
//   }
// `;
const QUERY = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: {kind: 'Name', value: 'GetPokemonByName'},
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: {kind: 'Variable', name: {kind: 'Name', value: 'name'}},
          type: {
            kind: 'NonNullType',
            type: {kind: 'NamedType', name: {kind: 'Name', value: 'String'}},
          },
          directives: [],
        },
      ],
      directives: [],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: {kind: 'Name', value: 'pokemon'},
            arguments: [
              {
                kind: 'Argument',
                name: {kind: 'Name', value: 'name'},
                value: {kind: 'Variable', name: {kind: 'Name', value: 'name'}},
              },
            ],
            directives: [],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                {
                  kind: 'Field',
                  name: {kind: 'Name', value: 'id'},
                  arguments: [],
                  directives: [],
                },
                {
                  kind: 'Field',
                  name: {kind: 'Name', value: 'name'},
                  arguments: [],
                  directives: [],
                },
              ],
            },
          },
        ],
      },
    },
  ],
  loc: {start: 0, end: 101},
};

/**
 * Even if the Apollo Client has already newer values (e.g. caused by user interaction triggering a mutation),
 * we want to rehydrate with the values from the server.
 * After that, we'll immediately trigger a rerender with the newer values from the Apollo Client.
 *
 * This prevents hydration mismatches in this edge case scenario.
 *
 * See https://react.dev/reference/react-dom/hydrate#handling-different-client-and-server-content
 */
function useSsrSuspenseQuery() {
  const [isClient, setIsClient] = React.useState(false);
  React.useEffect(() => setIsClient(true), []);

  const result = useSuspenseQuery(...arguments);
  const transportedValue = React.useStaticValue({
    data: result.data,
    networkStatus: result.networkStatus,
  });

  return isClient ? result : {...result, ...transportedValue};
}

function DataFetchingComponent() {
  const {data} = useSsrSuspenseQuery(QUERY, {variables: {name: 'ivysaur'}});

  console.log('[Apollo Client] rendering pokemon', data);
  return React.createElement('div', null, 'Pokemon: ', data.pokemon.name);
}

module.exports = {ApolloClientDemo};
