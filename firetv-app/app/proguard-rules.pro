# Methods called from JavaScript in the WebView
-keepclassmembers class com.homecinema.tv.MainActivity$Bridge {
    @android.webkit.JavascriptInterface <methods>;
}
-keepattributes JavascriptInterface
