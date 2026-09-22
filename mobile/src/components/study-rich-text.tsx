import React, { memo, useMemo, useState } from "react";
import { View } from "react-native";
import WebView from "react-native-webview";
import { useTheme } from "@/src/providers/ThemeProvider";
import { richStudyHtml, richStudyCss } from "@/src/lib/study-rich-text.mjs";
export const StudyRichText = memo(function StudyRichText({ content }: { content: string }) {
  const { colors } = useTheme();
  const [height, setHeight] = useState(80);
  const html = useMemo(() => `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=3"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-meras-measure'; style-src 'unsafe-inline'; img-src 'none'; connect-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'"><style>${richStudyCss}body{color:${colors.text};background:${colors.surface};}#content{display:flow-root}</style></head><body><div id="content">${richStudyHtml(content, true)}</div><script nonce="meras-measure">const report=()=>window.ReactNativeWebView.postMessage(JSON.stringify({height:Math.ceil(document.getElementById('content').getBoundingClientRect().height)+8}));new ResizeObserver(report).observe(document.getElementById('content'));document.fonts.ready.then(report);report();</script></body></html>`, [content, colors.text, colors.surface]);
  return <View style={{ height, minWidth: 0, width: "100%", overflow: "hidden", borderRadius: 10 }}>
    <WebView originWhitelist={["about:blank"]} source={{ html }} style={{ backgroundColor: colors.surface }}
      onShouldStartLoadWithRequest={request => request.url === "about:blank"}
      allowFileAccess={false} allowFileAccessFromFileURLs={false} allowUniversalAccessFromFileURLs={false}
      sharedCookiesEnabled={false} thirdPartyCookiesEnabled={false} domStorageEnabled={false} cacheEnabled={false}
      mixedContentMode="never" setSupportMultipleWindows={false} javaScriptCanOpenWindowsAutomatically={false}
      scrollEnabled={height >= 8000} showsVerticalScrollIndicator={height >= 8000}
      onMessage={event => { try { const data: unknown = JSON.parse(event.nativeEvent.data); if (data && typeof data === "object" && "height" in data && typeof data.height === "number" && Number.isFinite(data.height)) setHeight(Math.min(8000, Math.max(40, data.height))); } catch { /* Ignore invalid bridge messages. */ } }} />
  </View>;
});
