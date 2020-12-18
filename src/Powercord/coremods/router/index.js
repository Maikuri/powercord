/**
 * Copyright (c) 2018-2020 aetheryx & Bowser65
 * All Rights Reserved. Licensed under the Porkord License
 * https://powercord.dev/porkord-license
 */

const { inject, uninject } = require('powercord/injector');
const { React, getModule, getAllModules, getModuleByDisplayName } = require('powercord/webpack');
const { findInTree, findInReactTree, getOwnerInstance, waitFor } = require('powercord/util');

async function injectRouter () {
  const { container } = await getModule([ 'container', 'downloadProgressCircle' ]);
  const RouteRenderer = getOwnerInstance(await waitFor(`.${container.split(' ')[0]}`));
  inject('pc-router-routes', RouteRenderer.__proto__, 'render', (_, res) => {
    const { children: routes } = findInReactTree(res, m => Array.isArray(m.children) && m.children.length > 5);
    routes.push(
      ...powercord.api.router.routes.map(route => ({
        ...routes[0],
        props: {
          // @todo: Error boundary (?)
          render: () => React.createElement(route.render),
          path: `/_powercord${route.path}`
        }
      }))
    );
    return res;
  });
}

async function injectViews () {
  const FluxifiedViews = await getModuleByDisplayName('FluxContainer(ViewsWithMainInterface)');
  const Views = FluxifiedViews.prototype.render.call({ memoizedGetStateFromStores: () => ({}) }).type;

  inject('pc-router-views', Views.prototype, 'render', (args, res) => {
    const routes = findInTree(res, n => Array.isArray(n) && n[0] && n[0].key && n[0].props.path && n[0].props.render);

    routes[routes.length - 1].props.path = [
      ...new Set(routes[routes.length - 1].props.path.concat(powercord.api.router.routes.map(route => `/_powercord${route.path}`)))
    ];
    return res;
  });
}

async function injectSidebar () {
  const { panels } = await getModule([ 'panels' ]);
  const instance = getOwnerInstance(await waitFor(`.${panels}`));
  inject('pc-router-sidebar', (instance._reactInternals || instance._reactInternalFiber).type.prototype, 'render', (_, res) => {
    const renderer = res.props.children;
    res.props.children = (props) => {
      const rendered = renderer(props);
      const className = rendered && rendered.props && rendered.props.children && rendered.props.children.props && rendered.props.children.props.className;
      if (className && className.startsWith('sidebar-') && rendered.props.value.location.pathname.startsWith('/_powercord')) {
        const rawPath = rendered.props.value.location.pathname.substring(11);
        const route = powercord.api.router.routes.find(rte => rawPath.startsWith(rte.path));
        if (route && route.sidebar) {
          rendered.props.children.props.children[0] = React.createElement(route.sidebar);
        } else {
          rendered.props.children = null;
        }
      }
      return rendered;
    };
    return res;
  });
}

async function forceRouterUpdate () {
  // Views
  const { app } = getAllModules([ 'app' ]).find(m => Object.keys(m).length === 1);
  const viewsInstance = getOwnerInstance(await waitFor(`.${app}`));
  findInTree(viewsInstance._reactInternals || viewsInstance._reactInternalFiber, n => n && n.historyUnlisten, { walkable: [ 'child', 'stateNode' ] }).forceUpdate();

  // Routes
  const { container } = await getModule([ 'container', 'downloadProgressCircle' ]);
  const routesInstance = getOwnerInstance(await waitFor(`.${container}`));
  routesInstance.forceUpdate();
}

module.exports = async function () {
  await injectRouter();
  await injectViews();
  await injectSidebar();

  powercord.api.router.on('routeAdded', forceRouterUpdate);
  powercord.api.router.on('routeRemoved', forceRouterUpdate);

  return () => {
    powercord.api.router.off('routeAdded', forceRouterUpdate);
    powercord.api.router.off('routeRemoved', forceRouterUpdate);
    uninject('pc-router-routes');
    uninject('pc-router-views');
    uninject('pc-router-sidebar');
    forceRouterUpdate();
  };
};
