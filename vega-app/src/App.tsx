import {WebView} from '@amazon-devices/webview';
import * as React from 'react';
import {useCallback, useRef, useState} from 'react';
import {BackHandler, View, StyleSheet} from 'react-native';
import {
  useHideSplashScreenCallback,
  usePreventHideSplashScreen,
} from '@amazon-devices/react-native-kepler';
import {
  SslErrorData,
  WebViewErrorEvent,
  WebViewHttpErrorEvent,
  WebViewNavigationEvent,
} from '@amazon-devices/webview/dist/types/WebViewTypes';

/**
 * Home Cinema for Fire TV on Vega OS (e.g. Fire TV Stick 4K Select).
 *
 * The app is a thin shell around the shared Home Cinema TV web UI:
 *  1. It opens assets/connect.html, which asks once for the PC server address
 *     (or searches the Wi-Fi for it) and remembers it.
 *  2. The connect page then navigates to http://<pc>:8080/, the same UI the
 *     Hisense VIDAA TV uses. Remote keys (incl. BACK) go straight to that page.
 *  3. The page talks back through window.ReactNativeWebView.postMessage:
 *       {type:'exit'}    -> close the app (BACK on the main screen)
 *       {type:'sources'} -> show the connect page again to change server
 */
const CONNECT_URI = 'file:///pkg/assets/connect.html';

export const App = () => {
  const webRef = useRef(null);
  const [uri, setUri] = useState(CONNECT_URI);
  // Changing the key forces a fresh WebView load of `uri`.
  const [loadKey, setLoadKey] = useState(0);

  usePreventHideSplashScreen();
  const hideSplashScreenCallback = useHideSplashScreenCallback();

  const showConnect = useCallback((query: string) => {
    setUri(`${CONNECT_URI}?${query}&t=${Date.now()}`);
    setLoadKey(k => k + 1);
  }, []);

  const onMessage = useCallback(
    (event: {nativeEvent: {data: string}}) => {
      let msg: {type?: string} = {};
      try {
        msg = JSON.parse(event.nativeEvent.data);
      } catch (e) {
        return;
      }
      if (msg.type === 'exit') {
        BackHandler.exitApp();
      } else if (msg.type === 'sources') {
        showConnect('change=1');
      }
    },
    [showConnect],
  );

  return (
    <View style={styles.container}>
      <WebView
        key={loadKey}
        ref={webRef}
        style={styles.webview}
        allowSystemKeyEvents
        allowsDefaultMediaControl
        domStorageEnabled
        hasTVPreferredFocus
        javaScriptEnabled
        mediaPlaybackRequiresUserAction={false}
        mixedContentMode="compatibility"
        source={{uri}}
        onMessage={onMessage}
        onLoad={(_event: WebViewNavigationEvent) => {
          hideSplashScreenCallback();
        }}
        onError={({
          nativeEvent: {code, url, description},
        }: WebViewErrorEvent) => {
          console.error(`[onError]: (${code}: ${url}) ${description}`);
          // The PC server could not be reached: go back to the connect page.
          if (url && url.startsWith('http')) {
            showConnect('error=1');
          }
        }}
        onHttpError={({
          nativeEvent: {url, statusCode: code, description, isMainFrame},
        }: WebViewHttpErrorEvent) => {
          console.error(`[onHttpError]: (${code}: ${url}) ${description}`);
          if (isMainFrame && url && url.startsWith('http')) {
            showConnect('error=1');
          }
        }}
        onSslError={({code, url, description}: SslErrorData) => {
          console.error(`[onSslError]: (${code}: ${url}) ${description}`);
        }}
      />
    </View>
  );
};

// Styles for layout, which are necessary for proper focus behavior
const styles = StyleSheet.create({
  container: {flex: 1},
  webview: {backgroundColor: '#0d1016'},
});
