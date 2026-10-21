import localDevelopment from "@/config/local-development.cjs";

// 统一请求路径前缀
export const commonUrl =
  localDevelopment.enabled
    ? localDevelopment.apiPrefix
    : BASE.API_PROD.common;
export const managerUrl =
  localDevelopment.enabled
    ? localDevelopment.managerPrefix
    : BASE.API_PROD.manager + BASE.PREFIX;
// 文件上传接口
export const commonApiPath = path => {
  if (!/^\/(?:site|theme|slider\/[A-Z_]+|region\/(?:item\/[^/?]+|region|allCity)|upload\/file)$/.test(path)) {
    throw new Error('Unmapped common API');
  }
  return localDevelopment.enabled ? managerUrl + '/common' + path : commonUrl + '/common/common' + path;
};
export const uploadFile = commonApiPath('/upload/file');
