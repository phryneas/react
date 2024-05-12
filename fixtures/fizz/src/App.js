/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import Html from './Html';
import BigComponent from './BigComponent';
import ReactDOM from 'react-dom';
import React from 'react';
import {ReduxDemo} from './ReduxDemo';
const {ApolloClientDemo} = require('./ApolloClientDemo.js');

export default function App({assets, title}) {
  const components = [];

  const dispatch = React.useActionChannel(console.log);
  if (typeof window === 'undefined') {
    // triggers on the server, logs in the browser
    dispatch('hello from server');
    // dispatch(
    //   new Promise(resolve =>
    //     setTimeout(
    //       resolve,
    //       1000,
    //       'late goodbye from server, kept the stream open until this finished!'
    //     )
    //   )
    // );
  }

  console.log(
    // will transport the value from the server to the browser and log it there
    React.useStaticValue(
      `static value that was first seen ${
        typeof window === 'undefined' ? 'on the server' : 'in the browser'
      }.`
    )
  );

  for (let i = 0; i <= 250; i++) {
    components.push(<BigComponent key={i} />);
  }

  return (
    <Html assets={assets} title={title}>
      <h1>{title}</h1>
      <ReduxDemo />
      <ApolloClientDemo />
      <h1>all done</h1>
    </Html>
  );
}
