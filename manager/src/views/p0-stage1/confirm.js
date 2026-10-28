import {Modal} from 'view-design';

// The existing theme places drawers at 2600. Stage1 confirmations must stay
// above the active drawer, including its mask; the global theme stays intact.
export function stage1Confirm(options){
  const instance=Modal.newInstance({closable:false,maskClosable:false,footerHide:true,zIndex:3000,render:options.render,lockScroll:true});
  instance.show({...options,icon:'confirm',showCancel:true,onRemove(){}});
}
