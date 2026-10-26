import Vue from 'vue';
import ViewUI from 'view-design';
import Util from '../libs/util';
import VueRouter from 'vue-router';
import Cookies from 'js-cookie';
import {routers} from './router';
import {managerAccess, stage0ManagerEnabled} from '@/libs/manager-access';
import {managerSession} from '@/libs/manager-session';

Vue.use(VueRouter);

// 路由配置
const RouterConfig = {
  mode: 'history',
  routes: routers
};

/**
 * 解决重复点击菜单会控制台报错bug
 */
const routerPush = VueRouter.prototype.push
VueRouter.prototype.push = function push(location) {
  return routerPush.call(this, location).catch(error=> error)
}

export const router = new VueRouter(RouterConfig);

// Replace only the Stage0 dynamic set. addRoutes would re-enter the current
// navigation and would retain named routes belonging to the previous account.
router.replaceStage0Routes = routes => {
  router.matcher = new VueRouter({...RouterConfig, routes: [...routers, ...routes]}).matcher;
};
let stage0Rematch = null;
let stage0NavigationVersion = 0;

router.beforeEach(async (to, from, next) => {
  const navigation = ++stage0NavigationVersion;
  ViewUI.LoadingBar.start();
  Util.title(to.meta.title);

  const name = to.name;

  if (stage0ManagerEnabled) {
    const rematch = stage0Rematch;
    stage0Rematch = null;
    const source = managerSession.snapshot();
    if (!Cookies.get('userInfoManager') || !managerSession.sameSession(source)) {
      stage0Rematch = null;
      next(name === 'login' ? undefined : {name: 'login'});
      return;
    }
    if (name === 'login' || name === 'error-403') {
      next(name === 'login' ? {name: 'home_index'} : undefined);
      return;
    }
    const verified = await Util.initRouter(router.app);
    // A pending navigation from the previous account must not affect the new one.
    if (navigation !== stage0NavigationVersion || managerSession.snapshot().generation !== source.generation) {
      next(false);
      return;
    }
    const resolved = router.match(to.fullPath);
    if (!verified || !managerSession.sameSession(source) || !resolved.name ||
        !resolved.matched.length || !managerAccess.canRoute(resolved)) {
      stage0Rematch = null;
      next({name: 'error-403', replace: true});
      return;
    }
    const sameMatch = to.name === resolved.name && to.matched.length === resolved.matched.length &&
      to.matched.every((record, index) => record.path === resolved.matched[index].path &&
        record.name === resolved.matched[index].name &&
        record.meta.stage0MenuId === resolved.matched[index].meta.stage0MenuId);
    if (!sameMatch) {
      if (rematch && rematch.generation === source.generation && rematch.path === to.fullPath) {
        next({name: 'error-403', replace: true});
        return;
      }
      stage0Rematch = {generation: source.generation, path: to.fullPath};
      next({path: resolved.path, query: resolved.query, hash: resolved.hash, replace: true});
      return;
    }
    stage0Rematch = null;
    next();
    return;
  }

  if (!Cookies.get('userInfoManager') && name !== 'login') {
    // 判断是否已经登录且前往的页面不是登录页
    next({
      name: 'login'
    });
  } else if (Cookies.get('userInfoManager') && name === 'login') {
    // 判断是否已经登录且前往的是登录页
    Util.title();
    next({
      name: 'home_index'
    });
  } else {
    Util.toDefaultPage([...routers], name, router, next);
  }
});

router.afterEach((to) => {
  Util.openNewPage(router.app, to.name, to.params, to.query);
  ViewUI.LoadingBar.finish();
  window.scrollTo(0, 0);
});


