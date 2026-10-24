<template>
  <div class="search">
    <Card>
      <Alert v-if="!allowed" type="warning" show-icon>当前无权访问此管理功能，或权限读取尚未成功。</Alert>
      <template v-else>
        <Row class="operation padding-row"><Button type="primary" :loading="loading" @click="load(true)">刷新</Button></Row>
        <Table border :loading="loading" :columns="columns" :data="rows" />
        <Page v-if="kind !== 'menus'" :current="page" :total="total" :page-size="20" @on-change="changePage" />
      </template>
    </Card>
    <Modal v-model="roleModal" title="维护受限角色" :mask-closable="false">
      <Select v-model="selectedRoleIds" multiple :disabled="busy">
        <Option v-for="role in roleOptions" :key="role.id" :value="role.id">{{ role.name }}</Option>
      </Select>
      <div slot="footer"><Button @click="roleModal = false">取消</Button><Button type="primary" :disabled="!canSaveRoles" :loading="busy" @click="saveRoles">保存</Button></div>
    </Modal>
    <Modal v-model="menuModal" title="维护受限角色菜单" :mask-closable="false">
      <Alert type="info">仅调整获批的读取接口节点。已有目录关系由服务端保留，不能在此新增或删除目录关系。</Alert>
      <Tree ref="approvedTree" :data="menuNodes" show-checkbox />
      <div slot="footer"><Button @click="menuModal = false">取消</Button><Button type="primary" :disabled="!canSaveMenus" :loading="busy" @click="saveMenus">保存</Button></div>
    </Modal>
  </div>
</template>

<script>
import {managerAccess} from '@/libs/manager-access';
import {managerSession} from '@/libs/manager-session';
import util from '@/libs/util';
import {getUserListData, getRoleList, getAllPermissionList, selectRoleMenu,
  stage0UserRoles, stage0SetUserRoles, stage0SetRoleMenus, stage0SetUserStatus} from '@/api/index';

const readCapabilities = {users: 'USER_READ', roles: 'ROLE_READ', menus: 'MENU_READ'};
function required(response) {
  if (!response || response.success !== true) throw new Error('当前请求未成功，未执行后续操作');
  return response.result;
}
function flatten(nodes) {
  return (nodes || []).flatMap(node => [node, ...flatten(node.children)]);
}
export default {
  name: 'Stage0ManagerAccess',
  props: {kind: {type: String, required: true}},
  data() {
    return {authority: managerAccess.state, loading: false, busy: false, rows: [], page: 1, total: 0,
      roleModal: false, menuModal: false, targetUser: '', targetRole: '', selectedRoleIds: [], roleOptions: [], menuNodes: [],
      menuGrantIds: [], menuStructureIds: [], preservedStructureIds: []};
  },
  computed: {
    allowed() { return managerAccess.has(readCapabilities[this.kind]); },
    canSaveRoles() { return managerAccess.canManageUser(this.targetUser, 'USER_ROLE_WRITE'); },
    canSaveMenus() { return managerAccess.canManageRole(this.targetRole); },
    columns() {
      if (this.kind === 'menus') return [{title: '菜单', key: 'title'}, {title: '节点', key: 'id'}, {title: '权限', key: 'permission'}];
      if (this.kind === 'roles') return [{title: '角色名称', key: 'name'}, {title: '备注', key: 'description'},
        {title: '操作', render: (h, params) => managerAccess.canManageRole(params.row.id)
          ? h('Button', {props: {disabled: this.busy}, on: {click: () => this.openMenus(params.row)}}, '菜单权限') : h('span', '只读')}];
      return [{title: '用户名', key: 'username'}, {title: '昵称', key: 'nickName'},
        {title: '状态', render: (h, params) => h('span', params.row.status === true ? '启用' : params.row.status === false ? '禁用' : '未知')},
        {title: '操作', render: (h, params) => {
          const row = params.row;
          const actions = [];
          if (typeof row.status === 'boolean' && managerAccess.canManageUser(row.id, 'USER_STATUS_WRITE')) {
            actions.push(h('Button', {props: {disabled: this.busy}, on: {click: () => this.setStatus(row)}}, row.status ? '禁用' : '启用'));
          }
          if (managerAccess.canManageUser(row.id, 'USER_ROLE_WRITE')) {
            actions.push(h('Button', {props: {disabled: this.busy}, on: {click: () => this.openRoles(row)}}, '受限角色'));
          }
          return h('div', actions.length ? actions : ['只读']);
        }}];
    }
  },
  methods: {
    async load(verify = true) {
      this.loading = true;
      this.rows = [];
      const source = managerSession.snapshot();
      try {
        if (verify && !(await util.initRouter(this))) throw new Error('权限读取失败');
        if (!this.allowed) throw new Error('当前无权访问此管理功能');
        if (this.kind === 'menus') {
          const tree = required(await getAllPermissionList());
          if (!Array.isArray(tree)) throw new Error('菜单响应不完整');
          if (!managerSession.sameSession(source) || !this.allowed) return;
          const scope = new Set([...this.authority.info.stage0.readMenuIds, ...this.authority.info.stage0.maintenanceMenuIds]);
          this.rows = flatten(tree).filter(row => scope.has(row.id));
        } else {
          const response = required(await (this.kind === 'users' ? getUserListData : getRoleList)({pageNumber: this.page, pageSize: 20}));
          if (!response || !Array.isArray(response.records)) throw new Error('列表响应不完整');
          if (!managerSession.sameSession(source) || !this.allowed) return;
          const scope = this.kind === 'users' ? this.authority.info.stage0.manageableUserIds : this.authority.info.stage0.roleAIds;
          this.rows = response.records.filter(row => scope.includes(row.id));
          this.total = response.total;
        }
      } catch (error) {
        if (!managerSession.sameSession(source)) return;
        managerAccess.clear(); this.rows = [];
        this.$Message.error(error.message || '管理资料读取失败');
      } finally { this.loading = false; }
    },
    changePage(page) { this.page = page; this.load(true); },
    async afterWrite() {
      this.roleModal = false; this.menuModal = false;
      if (!(await util.initRouter(this)) || !managerAccess.canRoute(this.$route)) {
        this.rows = [];
        this.$router.replace({name: 'error-403'});
        return;
      }
      this.$Message.success('操作成功，已重新读取当前权限');
      await this.load(false);
    },
    setStatus(row) {
      if (!managerAccess.canManageUser(row.id, 'USER_STATUS_WRITE')) return;
      this.$Modal.confirm({title: row.status ? '确认禁用' : '确认启用', content: '仅修改所选普通账号的启用状态。', onOk: async () => {
        this.busy = true;
        try {
          const source = managerSession.snapshot();
          if (!managerAccess.canManageUser(row.id, 'USER_STATUS_WRITE')) throw new Error('当前授权已失效');
          required(await stage0SetUserStatus(row.id, !row.status));
          if (!managerSession.sameSession(source)) return;
          await this.afterWrite();
        } catch (error) { this.$Message.error(error.message || '账号状态未确认更新'); }
        finally { this.busy = false; }
      }});
    },
    async openRoles(row) {
      if (!managerAccess.canManageUser(row.id, 'USER_ROLE_WRITE')) return;
      this.busy = true;
      try {
        const source = managerSession.snapshot();
        const relations = required(await stage0UserRoles(row.id));
        const roles = required(await getRoleList({pageNumber: 1, pageSize: 100}));
        if (!managerSession.sameSession(source) || !managerAccess.canManageUser(row.id, 'USER_ROLE_WRITE')) return;
        const allowed = this.authority.info.stage0.roleAIds;
        if (!Array.isArray(relations) || !roles || !Array.isArray(roles.records) ||
            relations.some(item => item.userId !== row.id || !allowed.includes(item.roleId))) throw new Error('目标已有范围外角色，不能整体覆盖');
        this.targetUser = row.id;
        this.roleOptions = roles.records.filter(item => allowed.includes(item.id));
        this.selectedRoleIds = relations.map(item => item.roleId);
        this.roleModal = true;
      } catch (error) { this.$Message.error(error.message || '角色读取失败'); }
      finally { this.busy = false; }
    },
    async saveRoles() {
      if (!this.canSaveRoles || this.selectedRoleIds.some(id => !this.authority.info.stage0.roleAIds.includes(id))) return;
      this.busy = true;
      const source = managerSession.snapshot();
      try { required(await stage0SetUserRoles(this.targetUser, [...new Set(this.selectedRoleIds)])); if (managerSession.sameSession(source)) await this.afterWrite(); }
      catch (error) { this.$Message.error(error.message || '角色保存失败'); }
      finally { this.busy = false; }
    },
    async openMenus(role) {
      if (!managerAccess.canManageRole(role.id)) return;
      this.busy = true;
      try {
        const source = managerSession.snapshot();
        const relations = required(await selectRoleMenu(role.id));
        const tree = required(await getAllPermissionList());
        if (!managerSession.sameSession(source) || !managerAccess.canManageRole(role.id)) return;
        const allowed = this.authority.info.stage0.readMenuIds;
        if (!Array.isArray(relations) || !Array.isArray(tree)) throw new Error('菜单授权响应不完整');
        const allNodes = flatten(tree);
        const grantIds = allNodes.filter(item => allowed.includes(item.id) && typeof item.permission === 'string' &&
          item.permission.trim() && !(item.children && item.children.length)).map(item => item.id);
        const structureIds = allNodes.filter(item => allowed.includes(item.id) &&
          (item.permission == null || (typeof item.permission === 'string' && !item.permission.trim()))).map(item => item.id);
        if (new Set(allNodes.map(item => item.id)).size !== allNodes.length ||
            relations.some(item => item.roleId !== role.id || !allowed.includes(item.menuId) || item.isSuper !== false ||
              (!grantIds.includes(item.menuId) && !structureIds.includes(item.menuId)))) throw new Error('角色已有范围外授权，不能整体覆盖');
        const selected = new Set(relations.map(item => item.menuId));
        const nodes = items => items.map(item => ({...item, disabled: !allowed.includes(item.id),
          disableCheckbox: !grantIds.includes(item.id),
          checked: grantIds.includes(item.id) && selected.has(item.id), children: nodes(item.children || [])}));
        this.menuGrantIds = grantIds;
        this.menuStructureIds = structureIds;
        this.preservedStructureIds = relations.filter(item => structureIds.includes(item.menuId)).map(item => item.menuId);
        this.targetRole = role.id; this.menuNodes = nodes(tree); this.menuModal = true;
      } catch (error) { this.$Message.error(error.message || '菜单授权读取失败'); }
      finally { this.busy = false; }
    },
    async saveMenus() {
      if (!this.canSaveMenus) return;
      const checkedIds = this.$refs.approvedTree.getCheckedNodes().map(item => item.id);
      const allowed = this.authority.info.stage0.readMenuIds;
      if (checkedIds.some(id => !allowed.includes(id) || (!this.menuGrantIds.includes(id) && !this.menuStructureIds.includes(id))) ||
          this.preservedStructureIds.some(id => !allowed.includes(id))) return;
      // ViewUI cascades checked API leaves to their structural ancestors. Those
      // ancestors are not new grants; the server preserves their existing rows.
      const menuIds = checkedIds.filter(id => this.menuGrantIds.includes(id));
      this.busy = true;
      const source = managerSession.snapshot();
      try { required(await stage0SetRoleMenus(this.targetRole, [...new Set(menuIds)])); if (managerSession.sameSession(source)) await this.afterWrite(); }
      catch (error) { this.$Message.error(error.message || '菜单授权保存失败'); }
      finally { this.busy = false; }
    }
  },
  mounted() { this.load(true); }
};
</script>
