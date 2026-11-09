
<template>
  <Card v-if="show">
    <Alert v-if="$p0Integration" show-icon>本机 Mock 配置。外部支付、短信、微信、物流与 OSS 尚未配置；保存参数不代表已接通或允许真实调用。</Alert>
    <Alert v-if="error" type="error" show-icon>{{error}}</Alert>
    <Spin v-if="loading" fix />
    <Tabs v-model="selected" @on-click="clickTab">
      <TabPane :label="tabItem.name" :name="tabItem.type" v-for="(tabItem, tabIndex) in tabWay" :key="tabIndex">
        <fieldset v-if="settingData && selected === tabItem.type" :disabled="!$nativeCan('PUT','/manager/setting/setting/put/'+selected)" style="border:0;padding:0;min-width:0">
          <Alert v-if="!$nativeCan('PUT','/manager/setting/setting/put/'+selected)" type="info">当前授权只允许查看设置。</Alert>
          <component :res="settingData" :type="selected" :is="templateSetting[tabItem.type]" />
        </fieldset>
      </TabPane>
    </Tabs>
  </Card>
</template>
<script>
import {getSetting} from "@/api/index.js";
import templateSetting from "./template";

export default {
  data() {
    return {
      templateSetting, // 设置模板
      selected: "", // 已选
      settingData: "", error: "", loading: false, requestSequence: 0, // 模板数据
      show: true, // 是否显示
      setting: [
        //基础配置
        {
          type: "BASE_SETTING",
          name: "基础配置",
        },
        //商品设置
        {
          type: "GOODS_SETTING",
          name: "商品设置",
        },
        //订单配置
        {
          type: "ORDER_SETTING",
          name: "订单配置",
        },
        //积分设置
        {type: "POINT_SETTING", name: "积分设置"},
        {
          type: "WITHDRAWAL_SETTING",
          name: "提现设置",
        },
        //  快递查询设置
        {
          type: "LOGISTICS_SETTING",
          name: "快递查询设置",
        },
        //静态资源配置
        {
          type: "OSS_SETTING",
          name: "静态资源配置",
        },
        //短信配置
        {
          type: "SMS_SETTING",
          name: "短信配置",
        },
        //阿里短信配置
        {
          type: "IM_SETTING",
          name: "客服设置",
        },
      ],
      authLogin: [
        // 登录设置
        {type: "CONNECT_SETTING", name: "登录设置"},
        // 微信设置
        {type: "WECHAT_CONNECT", name: "微信设置"},
        // QQ设置
        {type: "QQ_CONNECT", name: "QQ设置"},
      ],
      pay: [
        //支付宝支付设置
        {type: "PAYMENT_SUPPORT", name: "支付开启/关闭"},
        //支付宝支付设置
        {type: "ALIPAY_PAYMENT", name: "支付宝支付设置"},
        //微信支付设置
        {type: "WECHAT_PAYMENT", name: "微信支付设置"},
      ],
      tabWay: [], // tab数据
    };
  },

  watch: {
    $route(to, from) {
      this.selected = "";
      this.show = false;
      this.getSettingData(this.selected);
      this.$nextTick(() => {
        this.show = true;
      });
    },
  },
  mounted() {
    this.clickTab(this.selected);
  },
  methods: {
    // tab切换
    clickTab(name) {
      this.selected = name;
      this.getSettingData(name);
    },
    /**
     * 进入页面请求第一个配置
     */
    getSettingData(name) {
      this.settingData = "";
      if (this.$p0Integration) this.tabWay = [...this.setting, ...this.authLogin, ...this.pay];
      else Object.keys(this).forEach((item) => {
        if (this.$route.name == item) {
          this.tabWay = this[item];
        }
      });
      // 点击页面给每项第一个数据赋值
      if (!name) {
        name = this.tabWay[0].type;
        this.selected = name;
      }

      const sequence=++this.requestSequence; this.loading=true;this.error='';
      getSetting(name).then(res => {
        if(sequence!==this.requestSequence)return;
        if(res.success && res.result) this.settingData=JSON.stringify(res.result);
        else this.error='设置读取失败，请重新选择或刷新。';
      }).catch(()=>{if(sequence===this.requestSequence)this.error='设置请求失败，请重试。';})
        .finally(()=>{if(sequence===this.requestSequence)this.loading=false;});
    },
  },
};
</script>
