import {
  createApi,
  fetchBaseQuery,
  // the way the bundler is setup, we need to import this downtranspiled version manually
} from '@reduxjs/toolkit/dist/query/react/rtk-query-react.cjs.development.js';
import {configureStore} from '@reduxjs/toolkit/dist/redux-toolkit.cjs.development.js';
import {Provider, useDispatch, useSelector} from 'react-redux';
import React from 'react';

const pokemonApi = createApi({
  baseQuery: fetchBaseQuery({baseUrl: 'https://pokeapi.co/api/v2/'}),
  endpoints(builder) {
    return {
      getPokemonByName: builder.query({
        query(name) {
          return `pokemon/${name}`;
        },
      }),
    };
  },
});

function streamingEnhancer(next) {
  return function(...args) {
    const store = next(...args);

    const source = {};

    let onDispatch = undefined;
    return Object.assign({}, store, {
      directDispatch(action) {
        store.dispatch(action);
      },
      setOnDispatch: handler => {
        onDispatch = handler;
      },
      dispatch: action => {
        if (
          onDispatch &&
          typeof action === 'object' &&
          typeof action.type === 'string'
        ) {
          console.log('transporting action', action);
          onDispatch(action);
        }
        return store.dispatch(action);
      },
    });
  };
}

function StreamingProvider({children}) {
  const store = React.useState(function() {
    return configureStore({
      reducer: {
        api: pokemonApi.reducer,
      },
      middleware(getDefaultMiddleware) {
        return getDefaultMiddleware().concat(pokemonApi.middleware);
      },
      enhancers(defaultEnhancers) {
        return defaultEnhancers.concat(streamingEnhancer);
      },
    });
  })[0];
  const dispachToActionChannel = React.useActionChannel(function(action) {
    if (typeof window !== 'undefined') {
      store.directDispatch(action);
    }
  });
  if (typeof window === 'undefined') {
    store.setOnDispatch(dispachToActionChannel);
  }
  return <Provider store={store}>{children}</Provider>;
}

export function ReduxDemo() {
  return (
    <div>
      ReduxDemo
      <StreamingProvider>
        <React.Suspense>
          <DataFetchingComponent />
        </React.Suspense>
      </StreamingProvider>
    </div>
  );
}
function DataFetchingComponent() {
  const dispatch = useDispatch();
  const promise = React.useState(() => {
    return dispatch(
      pokemonApi.endpoints.getPokemonByName.initiate('bulbasaur')
    );
  })[0];
  React.use(promise);
  const pokemon = useSelector(
    pokemonApi.endpoints.getPokemonByName.select('bulbasaur')
  );
  console.log('rendering', pokemon.data.name);
  return <div>Pokemon: {pokemon.data.name}</div>;
}
