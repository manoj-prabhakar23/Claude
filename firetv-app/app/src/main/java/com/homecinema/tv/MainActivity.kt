package com.homecinema.tv

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.app.AlertDialog
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.text.InputType
import android.view.KeyEvent
import android.view.WindowManager
import android.webkit.JavascriptInterface
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.EditText
import android.widget.Toast

/**
 * Hosts the shared Home Cinema TV web UI in a WebView.
 *  - "This Fire TV" mode: the UI talks to [LocalServer], which scans USB drives / internal storage.
 *  - "PC server" mode: the UI is loaded straight from a vidaa-media server on the home network.
 * Videos always play in the native [PlayerActivity] (ExoPlayer: MKV, multi-audio, subtitles).
 */
class MainActivity : Activity() {

    private lateinit var web: WebView
    private lateinit var server: LocalServer
    private val ui = Handler(Looper.getMainLooper())
    @Volatile private var baseUrl = LOCAL_URL
    private var lastRoots = ""
    private val prefs by lazy { getSharedPreferences("hc", Context.MODE_PRIVATE) }

    private val mountReceiver = object : BroadcastReceiver() {
        override fun onReceive(c: Context, i: Intent) { ui.postDelayed({ checkDrives(force = true) }, 1500) }
    }
    private val drivePoll = object : Runnable {
        override fun run() { checkDrives(false); ui.postDelayed(this, 10_000) }
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON or WindowManager.LayoutParams.FLAG_FULLSCREEN)
        server = LocalServer(applicationContext, Library(applicationContext), PORT).also { try { it.start(5000, false) } catch (e: Exception) { } }

        web = WebView(this)
        web.setBackgroundColor(Color.parseColor("#0d1016"))
        web.isFocusable = true
        web.isFocusableInTouchMode = true
        with(web.settings) {
            javaScriptEnabled = true
            domStorageEnabled = true
            mediaPlaybackRequiresUserGesture = false
            loadWithOverviewMode = true
            useWideViewPort = true
            if (Build.VERSION.SDK_INT >= 21) mixedContentMode = android.webkit.WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
        }
        web.addJavascriptInterface(Bridge(), "HCAndroid")
        web.webViewClient = object : WebViewClient() {
            override fun onReceivedError(view: WebView, req: WebResourceRequest, err: WebResourceError) {
                if (Build.VERSION.SDK_INT >= 21 && req.isForMainFrame && baseUrl != LOCAL_URL) serverUnreachable()
            }
            @Deprecated("old API")
            override fun onReceivedError(view: WebView, code: Int, desc: String?, url: String?) {
                if (Build.VERSION.SDK_INT < 23 && url != null && url.startsWith(baseUrl) && baseUrl != LOCAL_URL) serverUnreachable()
            }
        }
        setContentView(web)
        web.requestFocus()

        val filter = IntentFilter().apply {
            addAction(Intent.ACTION_MEDIA_MOUNTED); addAction(Intent.ACTION_MEDIA_UNMOUNTED)
            addAction(Intent.ACTION_MEDIA_REMOVED); addAction(Intent.ACTION_MEDIA_EJECT); addDataScheme("file")
        }
        registerReceiver(mountReceiver, filter)

        if (Build.VERSION.SDK_INT >= 23 && checkSelfPermission(Manifest.permission.READ_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(arrayOf(Manifest.permission.READ_EXTERNAL_STORAGE), 1)
        } else startLocalScan()
        loadUi()
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        if (grantResults.firstOrNull() != PackageManager.PERMISSION_GRANTED) toast("Allow storage access so Home Cinema can read your USB drive")
        startLocalScan()
    }

    private fun startLocalScan() {
        lastRoots = server.lib.rootsKey()
        server.rescanAsync()
        ui.removeCallbacks(drivePoll)
        ui.postDelayed(drivePoll, 10_000)
    }

    /** Rescan when a USB drive is plugged in or removed. */
    private fun checkDrives(force: Boolean) {
        Thread {
            val key = server.lib.rootsKey()
            if (force || key != lastRoots) {
                val added = key.length > lastRoots.length
                lastRoots = key
                server.rescanAsync()
                if (baseUrl == LOCAL_URL) ui.post { toast(if (added) "USB drive found — updating library…" else "Drive removed — updating library…") }
            }
        }.start()
    }

    private fun loadUi() {
        val remote = prefs.getString("server", null)
        baseUrl = remote?.trimEnd('/') ?: LOCAL_URL
        web.loadUrl("$baseUrl/")
    }

    override fun onResume() {
        super.onResume()
        web.evaluateJavascript("window.hcRefresh && window.hcRefresh()", null)
    }

    override fun onDestroy() {
        try { unregisterReceiver(mountReceiver) } catch (e: Exception) { }
        ui.removeCallbacksAndMessages(null)
        server.stop()
        web.destroy()
        super.onDestroy()
    }

    override fun dispatchKeyEvent(e: KeyEvent): Boolean {
        val name = when (e.keyCode) {
            KeyEvent.KEYCODE_BACK -> "BACK"
            KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE -> "PLAYPAUSE"
            KeyEvent.KEYCODE_MEDIA_PLAY -> "PLAY"
            KeyEvent.KEYCODE_MEDIA_PAUSE -> "PAUSE"
            KeyEvent.KEYCODE_MEDIA_FAST_FORWARD -> "FF"
            KeyEvent.KEYCODE_MEDIA_REWIND -> "RW"
            KeyEvent.KEYCODE_MEDIA_NEXT -> "NEXT"
            KeyEvent.KEYCODE_MEDIA_PREVIOUS -> "PREV"
            KeyEvent.KEYCODE_MEDIA_STOP -> "STOP"
            KeyEvent.KEYCODE_MENU -> "MENU"
            else -> null
        } ?: return super.dispatchKeyEvent(e)
        if (e.action != KeyEvent.ACTION_UP) return true
        when (name) {
            "MENU" -> showSources()
            "BACK" -> web.evaluateJavascript("window.hcBack ? window.hcBack() : false") { r -> if (r != "true") finish() }
            else -> web.evaluateJavascript("window.hcKey && window.hcKey('$name')", null)
        }
        return true
    }

    // ---------------------------------------------------------------- sources

    private fun showSources() {
        val local = baseUrl == LOCAL_URL
        val items = arrayOf(
            (if (local) "✓ " else "") + "This Fire TV — USB drive & internal storage",
            (if (!local) "✓ " else "") + "Home Cinema server on my PC…",
            "Rescan drives now",
        )
        AlertDialog.Builder(this, android.R.style.Theme_DeviceDefault_Dialog_Alert)
            .setTitle("Where are your movies?")
            .setItems(items) { _, which ->
                when (which) {
                    0 -> { prefs.edit().remove("server").apply(); loadUi() }
                    1 -> askServer()
                    2 -> { server.rescanAsync(); if (!local) web.evaluateJavascript("fetch('/api/rescan',{method:'POST'})", null); toast("Rescanning…") }
                }
            }.show()
    }

    private fun askServer() {
        val input = EditText(this).apply {
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_URI
            setText(prefs.getString("server", null) ?: "http://192.168.1.:8080")
            setSelection(text.length)
        }
        AlertDialog.Builder(this, android.R.style.Theme_DeviceDefault_Dialog_Alert)
            .setTitle("PC server address")
            .setMessage("Shown in the server window on your computer, e.g. http://192.168.1.20:8080")
            .setView(input)
            .setPositiveButton("Connect") { _, _ ->
                var url = input.text.toString().trim()
                if (!url.startsWith("http")) url = "http://$url"
                prefs.edit().putString("server", url.trimEnd('/')).apply()
                loadUi()
            }
            .setNegativeButton("Cancel", null)
            .show()
    }

    private fun serverUnreachable() {
        ui.post {
            if (isFinishing) return@post
            AlertDialog.Builder(this, android.R.style.Theme_DeviceDefault_Dialog_Alert)
                .setTitle("Can't reach your PC server")
                .setMessage("$baseUrl isn't answering. Is the server running and on the same Wi-Fi?")
                .setPositiveButton("Retry") { _, _ -> loadUi() }
                .setNeutralButton("Change address") { _, _ -> askServer() }
                .setNegativeButton("Use this Fire TV") { _, _ -> prefs.edit().remove("server").apply(); loadUi() }
                .show()
        }
    }

    private fun toast(msg: String) = Toast.makeText(this, msg, Toast.LENGTH_LONG).show()

    /** Called from the web UI (window.HCAndroid). Runs on a WebView background thread. */
    inner class Bridge {
        @JavascriptInterface fun playVideo(payload: String) {
            val base = baseUrl
            ui.post { startActivity(Intent(this@MainActivity, PlayerActivity::class.java).putExtra("payload", payload).putExtra("base", base)) }
        }
        @JavascriptInterface fun openSources() { ui.post { showSources() } }
        @JavascriptInterface fun exitApp() { ui.post { finish() } }
        @JavascriptInterface fun mode(): String = if (baseUrl == LOCAL_URL) "local" else "server"
    }

    companion object {
        const val PORT = 8765
        const val LOCAL_URL = "http://127.0.0.1:$PORT"
    }
}

