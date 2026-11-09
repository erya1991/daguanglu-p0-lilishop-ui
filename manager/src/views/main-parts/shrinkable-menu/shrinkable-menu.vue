<template>
  <div class="ivu-shrinkable-menu" :class="{ 'single-navigation': navList.length <= 1 }">
    <!-- 一级菜单 -->
    <Menu v-if="navList.length > 1" ref="sideMenu" width="80px" theme="dark"  :active-name="currNav" @on-select="selectNav">
      <MenuItem v-for="(item, i) in navList" :key="i" :name="item.name">
        {{item.title}}
      </MenuItem>
    </Menu>
    <div v-else-if="navList.length" class="navigation-title">{{ navList[0].title }}</div>
    <!-- 按原生授权分组展开，保留当前页面的所属菜单 -->
    <Menu
      ref="childrenMenu"
      :active-name="activeMenu"
      :open-names="openNames"
      accordion
      @on-open-change="openNames = $event"
      :width="navList.length > 1 ? '120px' : '200px'"
      @on-select="changeMenu"
    >
      <template v-for="item in menuList">
        <Submenu :name="item.name" :key="item.id || item.name">
          <template slot="title">{{ item.title }}</template>
          <MenuItem :name="menu.name" v-for="menu in item.children" :key="menu.name">
            {{menu.title}}
          </MenuItem>
        </Submenu>

      </template>
    </Menu>
  </div>
</template>

<script>
import util from "@/libs/util.js";

export default {
  name: "shrinkableMenu",
  data() {
    return { openNames: [] };
  },
  computed: {
    activeMenu() {
      const route = this.$route;
      for (const group of this.menuList) {
        const leaf = (group.children || []).find(item => item.name === route.name ||
          route.meta && route.meta.stage0MenuId && item.id === route.meta.stage0MenuId);
        if (leaf) return leaf.name;
      }
      return route.name;
    },
    activeGroup() {
      const group = this.menuList.find(item => (item.children || []).some(child => child.name === this.activeMenu));
      return group ? group.name : null;
    },
    menuList() {
      return this.$store.state.app.menuList;
    },
    navList() {
      return this.$store.state.app.navList;
    },
    currNav() {
      return this.$store.state.app.currNav;
    }
  },
  mounted() { this.syncMenuState(); },
  watch: {
    menuList() { this.syncMenuState(); },
    activeMenu() { this.syncMenuState(); },
    // 监听路由变化
    $route: {
      handler: function (val, oldVal) {
        if (val.meta.firstRouterName && val.meta.firstRouterName !== this.currNav) {
          this.selectNav(val.meta.firstRouterName)
        }
      }
    }
  },
  methods: {
    syncMenuState() {
      this.openNames = this.activeGroup ? [this.activeGroup] : [];
      this.$nextTick(() => {
        if (this.$refs.childrenMenu) {
          this.$refs.childrenMenu.updateOpened();
          this.$refs.childrenMenu.updateActiveName();
        }
      });
    },
    changeMenu(name) { //二级路由点击
      if (name === this.$route.name) return;
      this.$router.push({
        name: name
      });
    },
    selectNav(name) { // 一级路由点击事件
      this.$store.commit("setCurrNav", name);
      this.setStore("currNav", name);
      util.initRouter(this);
      this.$nextTick(()=>{
        this.$refs.childrenMenu.updateActiveName()
      })
    },
  }
};
</script>
<style lang="scss" scoped>
.ivu-shrinkable-menu{
    height: calc(100% - 60px);
    width: 200px;
    display: flex;
}

.single-navigation {
  display: block;
  .navigation-title {
    height: 44px;
    padding: 0 20px;
    line-height: 44px;
    font-weight: 600;
    border-bottom: 1px solid #e8eaec;
  }
  > .ivu-menu { height: calc(100% - 44px); }
  ::v-deep .ivu-menu-submenu-title { padding: 14px 20px; font-weight: 600; }
  ::v-deep .ivu-menu-submenu .ivu-menu-item { padding: 12px 20px 12px 36px; }
}

.ivu-btn-text:hover {
    background-color: rgba(255,255,255,.2) !important;
}
.ivu-menu-dark.ivu-menu-vertical .ivu-menu-item-active:not(.ivu-menu-submenu), .ivu-menu-dark.ivu-menu-vertical .ivu-menu-submenu-title-active:not(.ivu-menu-submenu){
    background-color: #fff;
    &:hover{
        background-color: #fff;
    }
}
.ivu-menu-vertical{
  overflow-y: auto;
}
.ivu-menu-dark.ivu-menu-vertical .ivu-menu-item-active:not(.ivu-menu-submenu), .ivu-menu-dark.ivu-menu-vertical .ivu-menu-submenu-title-active:not(.ivu-menu-submenu){
    color: $theme_color;
}
::v-deep.ivu-menu-vertical .ivu-menu-item-group-title {
    height: 40px;
    line-height: 40px;
    padding-left: 20px;
}
</style>
