import {stage2Image} from '@/api/stage2-ui';
export const stage2WebUiEnabled=typeof BASE!=='undefined'&&BASE.stage2Enabled===true&&BASE.stage2WebUiEnabled===true;
// Reuse the stable ProductImage template/state, adapting only its S1-only preview loader.
export function productImage(Base){return {extends:Base,props:{goodsId:String},methods:{async reload(){const ticket=++this.ticket;if(this.url)URL.revokeObjectURL(this.url);this.url=null;this.error='';if(!this.fileId||!this.goodsId)return;try{const url=await stage2Image(this.goodsId,this.fileId);if(ticket!==this.ticket){URL.revokeObjectURL(url);return;}this.url=url;}catch(e){if(ticket===this.ticket)this.error=e.message;}}}};}
