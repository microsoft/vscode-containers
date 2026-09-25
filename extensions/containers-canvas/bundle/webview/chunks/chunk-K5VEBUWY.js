/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *
 * This bundle includes third-party software. See NOTICE.html for attributions.
 */
function c(r){let n=r??(typeof window>"u"?{}:window.location),t=String(n.hash??"").replace(/^#/,""),e=new URLSearchParams(t).get("t");return e||(new URLSearchParams(String(n.search??"")).get("t")??"")}function f(r,n={},t){let e=t??(typeof window>"u"?"http://127.0.0.1/":window.location.href),o=new URL(r,typeof e=="string"?e:e.href);for(let[i,s]of Object.entries(n))s!=null&&o.searchParams.set(i,String(s));let a=c(typeof e=="string"?void 0:t);return a&&o.searchParams.set("t",a),o.hash="",o}var h=(r,n,t)=>f(r,n,t).toString();export{f as a,h as b};
