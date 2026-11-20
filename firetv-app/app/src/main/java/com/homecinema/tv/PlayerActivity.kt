package com.homecinema.tv

import android.app.Activity
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.KeyEvent
import android.view.WindowManager
import android.widget.Toast
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.MimeTypes
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.TrackSelectionOverride
import androidx.media3.common.Tracks
import androidx.media3.exoplayer.DefaultRenderersFactory
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.PlayerView
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/**
 * Native full-screen player (Media3 ExoPlayer). Plays MP4/MKV/AVI/TS…, lets the viewer pick
 * audio language and subtitles from the remote, and reports resume positions to the server.
 *
 * Intent extras: "base" (server URL) and "payload" JSON:
 *   { items:[{id,title,subtitle,subs:[{id,lang}]}], index, start, audio, sub }
 */
class PlayerActivity : Activity() {

    private lateinit var player: ExoPlayer
    private lateinit var view: PlayerView
    private lateinit var base: String
    private val ui = Handler(Looper.getMainLooper())
    private var pendingAudio = -1
    private var reportedEnd = false

    private val ticker = object : Runnable {
        override fun run() { report(false); ui.postDelayed(this, 10_000) }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON or WindowManager.LayoutParams.FLAG_FULLSCREEN)
        base = intent.getStringExtra("base") ?: MainActivity.LOCAL_URL
        val p = JSONObject(intent.getStringExtra("payload") ?: "{}")
        val items = p.optJSONArray("items")
        val index = p.optInt("index", 0)
        val subChoice = p.optInt("sub", -1)
        pendingAudio = p.optInt("audio", -1)

        val renderers = DefaultRenderersFactory(this).setEnableDecoderFallback(true)
        player = ExoPlayer.Builder(this, renderers).setSeekBackIncrementMs(10_000).setSeekForwardIncrementMs(30_000).build()
        view = PlayerView(this).apply {
            player = this@PlayerActivity.player
            setShowSubtitleButton(true)
            controllerShowTimeoutMs = 4000
            keepScreenOn = true
            setShowNextButton(items != null && items.length() > 1)
            setShowPreviousButton(items != null && items.length() > 1)
        }
        setContentView(view)

        val mediaItems = ArrayList<MediaItem>()
        if (items != null) for (i in 0 until items.length()) {
            val it = items.getJSONObject(i)
            val subs = it.optJSONArray("subs")
            val subConfigs = ArrayList<MediaItem.SubtitleConfiguration>()
            if (subs != null) for (s in 0 until subs.length()) {
                val sj = subs.getJSONObject(s)
                if (sj.has("embedded")) continue // embedded tracks are read from the file itself
                val lang = sj.optString("lang")
                subConfigs.add(MediaItem.SubtitleConfiguration.Builder(Uri.parse("$base/sub/${sj.getString("id")}"))
                    .setMimeType(MimeTypes.TEXT_VTT)
                    .setLanguage(MediaNames.isoCode(lang) ?: "und")
                    .setLabel(lang)
                    .setSelectionFlags(if (i == index && s == subChoice) C.SELECTION_FLAG_DEFAULT else 0)
                    .build())
            }
            mediaItems.add(MediaItem.Builder()
                .setUri("$base/media/${it.getString("id")}")
                .setMediaId(it.getString("id"))
                .setMediaMetadata(MediaMetadata.Builder().setTitle(it.optString("title")).setSubtitle(it.optString("subtitle")).build())
                .setSubtitleConfigurations(subConfigs)
                .build())
        }
        player.addListener(object : Player.Listener {
            override fun onTracksChanged(tracks: Tracks) {
                if (pendingAudio < 0) return
                val groups = tracks.groups.filter { it.type == C.TRACK_TYPE_AUDIO }
                val g = groups.getOrNull(pendingAudio)
                pendingAudio = -1
                if (g != null && g.isSupported) {
                    player.trackSelectionParameters = player.trackSelectionParameters.buildUpon()
                        .setOverrideForType(TrackSelectionOverride(g.mediaTrackGroup, 0)).build()
                }
            }
            override fun onMediaItemTransition(item: MediaItem?, reason: Int) {
                if (reason == Player.MEDIA_ITEM_TRANSITION_REASON_AUTO) {
                    val prev = player.currentMediaItemIndex - 1
                    if (prev >= 0) post(player.getMediaItemAt(prev).mediaId, 0, 0, true)
                    // a new episode: let ExoPlayer choose its default audio again
                    player.trackSelectionParameters = player.trackSelectionParameters.buildUpon().clearOverridesOfType(C.TRACK_TYPE_AUDIO).build()
                }
            }
            override fun onPlaybackStateChanged(state: Int) {
                if (state == Player.STATE_ENDED && !reportedEnd) { reportedEnd = true; report(true); finish() }
            }
            override fun onPlayerError(error: PlaybackException) {
                Toast.makeText(this@PlayerActivity, "Can't play this file: ${error.errorCodeName}", Toast.LENGTH_LONG).show()
            }
        })
        player.setMediaItems(mediaItems, index.coerceIn(0, maxOf(0, mediaItems.size - 1)), (p.optDouble("start", 0.0) * 1000).toLong())
        player.prepare()
        player.playWhenReady = true
        ui.postDelayed(ticker, 10_000)
    }

    override fun dispatchKeyEvent(e: KeyEvent): Boolean {
        if (e.action == KeyEvent.ACTION_DOWN && !view.isControllerFullyVisible) {
            when (e.keyCode) {
                KeyEvent.KEYCODE_DPAD_LEFT -> { player.seekBack(); view.showController(); return true }
                KeyEvent.KEYCODE_DPAD_RIGHT -> { player.seekForward(); view.showController(); return true }
                KeyEvent.KEYCODE_DPAD_CENTER, KeyEvent.KEYCODE_ENTER -> { player.playWhenReady = !player.playWhenReady; view.showController(); return true }
            }
        }
        if (e.keyCode == KeyEvent.KEYCODE_BACK && e.action == KeyEvent.ACTION_UP && view.isControllerFullyVisible) { view.hideController(); return true }
        return super.dispatchKeyEvent(e) || view.dispatchKeyEvent(e)
    }

    override fun onPause() { super.onPause(); player.playWhenReady = false; report(false) }

    override fun onDestroy() {
        ui.removeCallbacksAndMessages(null)
        if (!reportedEnd) report(false)
        player.release()
        super.onDestroy()
    }

    private fun report(done: Boolean) {
        val item = player.currentMediaItem ?: return
        val pos = player.currentPosition / 1000
        val dur = if (player.duration > 0) player.duration / 1000 else 0
        if (!done && pos < 1) return
        post(item.mediaId, pos, dur, done)
    }

    private fun post(id: String, pos: Long, dur: Long, done: Boolean) {
        val body = JSONObject().put("id", id).put("pos", pos).put("dur", dur).put("done", done).toString()
        Thread {
            try {
                val c = URL("$base/api/progress").openConnection() as HttpURLConnection
                c.requestMethod = "POST"; c.doOutput = true; c.connectTimeout = 3000; c.readTimeout = 3000
                c.setRequestProperty("Content-Type", "application/json")
                c.outputStream.use { it.write(body.toByteArray()) }
                c.inputStream.close(); c.disconnect()
            } catch (e: Exception) { }
        }.start()
    }
}
