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

export default function App({assets, title}) {
  const components = [];

  if (typeof window === 'undefined') {
    ReactDOM.dangerous_appendScript(`/*!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!*/
      console.log("hello from server")`);
    // this currently works in the sense of "keep the stream open until the promise resolves"
    // but it doesn't *really* work yet - part of the response HTML between these two scripts gets lost
    ReactDOM.dangerous_appendScript(
      new Promise(resolve =>
        setTimeout(
          resolve,
          5000,
          `/*!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!*/
      console.log("late goodbye from server")`
        )
      )
    );
  }

  for (let i = 0; i <= 250; i++) {
    components.push(<BigComponent key={i} />);
  }

  return (
    <Html assets={assets} title={title}>
      <h1>{title}</h1>
      {components}
      <h1>all done</h1>
    </Html>
  );
}
