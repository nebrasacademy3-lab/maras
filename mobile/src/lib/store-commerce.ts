/** Native store distribution never opens direct checkout. */
export function resolveStoreMode(options:{platform:string;executionEnvironment?:string;development:boolean;configuredMode?:unknown;distribution?:unknown;readerPreview?:boolean}):"reader"|"direct"|"iap" {
 const requested=String(options.configuredMode||"reader").trim().toLowerCase();
 if(requested==="reader"&&options.readerPreview)return "reader";
 if(options.platform==="web")return "direct";
 if(requested==="iap")return options.executionEnvironment==="storeClient"?"reader":"iap";
 if(options.executionEnvironment==="storeClient"||options.development)return "direct";
 return requested==="direct"&&options.distribution==="internal"?"direct":"reader";
}