import axios from "axios";
import { getStore, setStore } from "./storage.js";
import { router } from "../router/index";
import { Message } from "view-design";
import { handleRefreshToken } from "../api/index";
import { managerSession } from './manager-session';
import { failureKind, credentialEndpoint, replayable } from './manager-session-core.cjs';
import {v4 as uuidv4} from 'uuid';

import localDevelopment from "@/config/local-development.cjs";

import {commonUrl, managerUrl, commonApiPath, uploadFile} from "./api-address";
export {commonUrl, managerUrl, commonApiPath, uploadFile};


const service = axios.create({
  timeout: 8000,
  baseURL: managerUrl
});
const stage0ManagerProtocol = typeof BASE !== 'undefined' && BASE.stage0ManagerSessionEnabled === true;
service.interceptors.request.use(
  config => {
    if (localDevelopment.enabled && !localDevelopment.allowedRequest(config)) {
      return Promise.reject(new Error('Local development request target is not approved'));
    }
    // Axios joins root-relative URLs to baseURL; retain the Manager prefix exactly once.
    if (localDevelopment.enabled && config.url.startsWith(managerUrl + '/')) {
      config.url = config.url.slice(managerUrl.length);
    }
    if (config.method == "get") {
      config.params = {
        _t: Date.parse(new Date()) / 1000,
        ...config.params
      };
    }
    let uuid = getStore("uuid");
    if (!uuid) {
      uuid = uuidv4();
      setStore('uuid', uuid);
    }
    config.headers["uuid"] = uuid;
    if (!credentialEndpoint(config.url) && config.headers.accessToken) {
      const source = managerSession.snapshot();
      if (source.accessToken !== config.headers.accessToken) {
        return Promise.reject(new Error('Manager session changed before request'));
      }
      config.__managerSession = source;
    }
    return config;
  },
  err => {
    Message.error("请求超时");
    return Promise.reject(err);
  }
);

function redirectIfLoggedOut() {
  const current = managerSession.snapshot();
  if (!current.accessToken && !current.refreshToken && router.history.current.name !== 'login') {
    router.push('/login');
  }
}

async function recoverRead(config) {
  if (!config || credentialEndpoint(config.url) || !config.__managerSession) return false;
  if (config.__managerRetried || !replayable(config.method)) {
    managerSession.expire(config.__managerSession);
    redirectIfLoggedOut();
    return false;
  }
  const recovered = await managerSession.recover(config.__managerSession, handleRefreshToken);
  if (!recovered || !managerSession.sameSession(config.__managerSession)) {
    redirectIfLoggedOut();
    return false;
  }
  return true;
}

function retryRead(config) {
  return service({...config, __managerRetried: true, headers: {
    ...config.headers, accessToken: managerSession.snapshot().accessToken
  }});
}

// Business rejection is never converted to a successful write or a refresh.
service.interceptors.response.use(
  async response => {
    const data = response.data;
    if (failureKind(response.status, data, stage0ManagerProtocol) === 'expired') {
      if (await recoverRead(response.config)) return retryRead(response.config);
    }
    if (data && data.success === false && data.message) Message.error(data.message);
    return data;
  },
  async error => {
    if (error.response) {
      const {status, data} = error.response;
      const config = error.config || error.response.config;
      if (failureKind(status, data, stage0ManagerProtocol) === 'expired' && await recoverRead(config)) {
        return retryRead(config);
      }
      if (data && data.message) Message.error(data.message);
    }
    return Promise.reject(error);
  }
);

export const getRequest = (url, params, resBlob) => {
  let accessToken = getStore("accessToken");
  let data = {
    method: "get",
    url: `${url}`,
    params: params,
    headers: {
      accessToken: accessToken
    },
    responseType: "blob"
  };
  if (resBlob != "blob") {
    delete data.responseType;
  }
  return service(data);
};


export const postRequest = (url, params, headers) => {
  let accessToken = getStore("accessToken");
  return service({
    method: "post",
    url: `${url}`,
    data: params,
    transformRequest: headers
      ? undefined
      : [
          function(data) {
            let ret = "";
            for (let it in data) {
              ret +=
                encodeURIComponent(it) +
                "=" +
                encodeURIComponent(data[it]) +
                "&";
            }
            ret = ret.substring(0, ret.length - 1);
            return ret;
          }
        ],
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      accessToken: accessToken,
      ...headers
    }
  });
};

/** 不带form表单不带transformRequest */
export const postRequestWithNoForm = (url, params) => {
  let accessToken = getStore("accessToken");
  return service({
    method: "post",
    url: `${url}`,
    data: params,

    headers: {
      accessToken: accessToken
    }
  });
};

// export const postRequestWithHeaders = (url, params) => {
//   let accessToken = getStore("accessToken");
//   return axios({
//     method: "post",
//     url: `${url}`,
//     data: params,

//     headers: {
//       accessToken: accessToken,
//       "Content-Type": "application/x-www-form-urlencoded"
//     }
//   });
// };

export const putRequest = (url, params, headers) => {
  let accessToken = getStore("accessToken");
  return service({
    method: "put",
    url: `${url}`,
    data: params,
    transformRequest: headers
      ? undefined
      : [
          function(data) {
            let ret = "";
            for (let it in data) {
              ret +=
                encodeURIComponent(it) +
                "=" +
                encodeURIComponent(data[it]) +
                "&";
            }
            ret = ret.substring(0, ret.length - 1);
            return ret;
          }
        ],
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      accessToken: accessToken,
      ...headers
    }
  });
};

export const putRequestWithNoForm = (url, params) => {
  let accessToken = getStore("accessToken");
  return service({
    method: "put",
    url: `${url}`,
    data: params,

    headers: {
      accessToken: accessToken
    }
  });
};

export const deleteRequest = (url, params) => {
  let accessToken = getStore("accessToken");
  return service({
    method: "delete",
    url: `${url}`,
    params: params,
    headers: {
      accessToken: accessToken
    }
  });
};

export const importRequest = (url, params) => {
  let accessToken = getStore("accessToken");
  return service({
    method: "post",
    url: `${url}`,
    data: params,
    headers: {
      accessToken: accessToken
    }
  });
};

export const uploadFileRequest = (url, params) => {
  let accessToken = getStore("accessToken");
  return service({
    method: "post",
    url: `${url}`,
    data: params,
    headers: {
      accessToken: accessToken,
      'Content-Type': 'multipart/form-data'
    }
  });
};

/**
 * 无需token验证的请求 避免旧token过期导致请求失败
 * @param {*} url
 * @param {*} params
 */
export const getRequestWithNoToken = (url, params) => {
  return service({
    method: "get",
    url: `${url}`,
    params: params
  });
};

/**
 * 无需token验证的请求 避免旧token过期导致请求失败
 * @param {*} url
 * @param {*} params
 */
export const postRequestWithNoToken = (url, params) => {
  return service({
    method: "post",
    url: `${url}`,
    params: params
  });
};

/**
 * 无需token验证的请求 避免旧token过期导致请求失败
 * @param {*} url
 * @param {*} params
 */
export const postRequestWithNoTokenData = (url, params, headers) => {
  return service({
    method: "post",
    url: `${url}`,
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      ...headers
    },
    data: params
  });
};
