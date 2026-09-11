package com.xiaoxuhui.conway

import android.annotation.SuppressLint
import android.content.ContentValues
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.provider.MediaStore
import android.view.View
import android.webkit.JavascriptInterface
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.updatePadding
import androidx.webkit.WebViewAssetLoader
import java.io.File
import java.io.OutputStream

/**
 * 康威生命游戏 安卓外壳。
 *
 * 设计要点：
 * - 页面资源内置在 assets 中，通过 WebViewAssetLoader 以 https 域名加载，
 *   这样 localStorage 的 origin 稳定，数据可持久化且不依赖网络。
 * - 全离线：不申请任何权限，不做任何网络请求。
 * - 网页中的导出（Blob 下载）在 WebView 中不可用，通过注入脚本 + JS 桥
 *   改为写入系统下载目录。
 */
class MainActivity : ComponentActivity() {

    private lateinit var webView: WebView

    /** 网页 <input type="file"> 触发的文件选择回调 */
    private var filePathCallback: ValueCallback<Array<Uri>>? = null

    private val fileChooserLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        val callback = filePathCallback ?: return@registerForActivityResult
        filePathCallback = null
        val data = result.data
        callback.onReceiveValue(
            when {
                result.resultCode != RESULT_OK || data == null -> null
                data.clipData != null -> {
                    val clip = data.clipData!!
                    Array(clip.itemCount) { clip.getItemAt(it).uri }
                }
                data.data != null -> arrayOf(data.data!!)
                else -> null
            }
        )
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        webView = buildWebView()
        setContentView(webView)

        // 处理系统栏遮挡（Android 15 起会强制 edge-to-edge）
        ViewCompat.setOnApplyWindowInsetsListener(webView) { view, insets ->
            val bars = insets.getInsets(
                WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.ime()
            )
            view.updatePadding(bars.left, bars.top, bars.right, bars.bottom)
            insets
        }

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (webView.canGoBack()) {
                    webView.goBack()
                } else {
                    isEnabled = false
                    onBackPressedDispatcher.onBackPressed()
                }
            }
        })

        if (savedInstanceState == null) {
            webView.loadUrl(PAGE_URL)
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun buildWebView(): WebView {
        val view = WebView(this)
        view.setBackgroundColor(Color.parseColor("#0B100F"))
        view.overScrollMode = View.OVER_SCROLL_NEVER
        view.isVerticalScrollBarEnabled = false

        view.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            // 仅通过 WebViewAssetLoader 读取内置资源，不允许访问本地文件系统
            allowFileAccess = false
            allowContentAccess = false
            // 触摸端禁用双指缩放，避免与页面手势冲突
            setSupportZoom(false)
            builtInZoomControls = false
            displayZoomControls = false
            mediaPlaybackRequiresUserGesture = true
            cacheMode = WebSettings.LOAD_DEFAULT
            textZoom = 100
        }

        val assetLoader = WebViewAssetLoader.Builder()
            .setDomain(ASSET_DOMAIN)
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        view.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(
                view: WebView,
                request: WebResourceRequest
            ): WebResourceResponse? = assetLoader.shouldInterceptRequest(request.url)

            override fun shouldOverrideUrlLoading(
                view: WebView,
                request: WebResourceRequest
            ): Boolean {
                val url = request.url
                if (url.host == ASSET_DOMAIN) return false
                // 本期页面无外链，仅作兜底：外部链接交给系统处理
                runCatching { startActivity(Intent(Intent.ACTION_VIEW, url)) }
                return true
            }

            override fun onPageFinished(view: WebView, url: String) {
                super.onPageFinished(view, url)
                view.evaluateJavascript(EXPORT_BRIDGE_JS, null)
            }
        }

        view.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(
                webView: WebView,
                filePathCallback: ValueCallback<Array<Uri>>,
                fileChooserParams: FileChooserParams
            ): Boolean {
                this@MainActivity.filePathCallback?.onReceiveValue(null)
                this@MainActivity.filePathCallback = filePathCallback
                return try {
                    fileChooserLauncher.launch(fileChooserParams.createIntent())
                    true
                } catch (e: Exception) {
                    this@MainActivity.filePathCallback = null
                    false
                }
            }
        }

        view.addJavascriptInterface(Bridge(), "ConwayAndroid")
        return view
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        webView.saveState(outState)
    }

    override fun onRestoreInstanceState(savedInstanceState: Bundle) {
        super.onRestoreInstanceState(savedInstanceState)
        webView.restoreState(savedInstanceState)
    }

    /** 供网页调用的原生能力 */
    private inner class Bridge {

        /** 保存文本到系统下载目录 */
        @JavascriptInterface
        fun saveFile(name: String, content: String) {
            Thread {
                val message = try {
                    val saved = writeToDownloads(sanitizeName(name), content)
                    "已保存到「$saved」"
                } catch (e: Exception) {
                    "保存失败：${e.message ?: "未知错误"}"
                }
                runOnUiThread { Toast.makeText(this@MainActivity, message, Toast.LENGTH_LONG).show() }
            }.start()
        }
    }

    /** 写文件：Android 10+ 走 MediaStore 下载目录，更低版本写应用外部目录 */
    private fun writeToDownloads(name: String, content: String): String {
        val bytes = content.toByteArray(Charsets.UTF_8)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val values = ContentValues().apply {
                put(MediaStore.Downloads.DISPLAY_NAME, name)
                put(MediaStore.Downloads.MIME_TYPE, "application/json")
                put(MediaStore.Downloads.IS_PENDING, 1)
            }
            val resolver = contentResolver
            val uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
                ?: throw IllegalStateException("无法创建下载文件")
            resolver.openOutputStream(uri)?.use { it.write(bytes) }
                ?: throw IllegalStateException("无法写入下载文件")
            values.clear()
            values.put(MediaStore.Downloads.IS_PENDING, 0)
            resolver.update(uri, values, null, null)
            return "下载/$name"
        }

        val dir = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS) ?: filesDir
        if (!dir.exists()) dir.mkdirs()
        val file = File(dir, name)
        val stream: OutputStream = file.outputStream()
        stream.use { it.write(bytes) }
        return file.absolutePath
    }

    /** 去掉路径分隔符，避免写出意外位置 */
    private fun sanitizeName(name: String): String {
        val cleaned = name.replace(Regex("[\\\\/:*?\"<>|]"), "_").trim()
        val fallback = "conway-life-export.json"
        val result = if (cleaned.isEmpty() || cleaned == "." || cleaned == "..") fallback else cleaned
        return if (result.length > 120) result.take(120) else result
    }

    companion object {
        private const val ASSET_DOMAIN = "appassets.androidplatform.net"
        private const val ASSET_FILE = "index.html"
        private const val PAGE_URL = "https://$ASSET_DOMAIN/assets/$ASSET_FILE"

        /**
         * 拦截网页的「保存列表」：网页用 Blob URL + download 属性导出，
         * WebView 不支持该下载方式，这里改为抓取内容交给原生保存。
         */
        private val EXPORT_BRIDGE_JS = """
            (function () {
              if (window.__conwayAndroidBridge) { return; }
              window.__conwayAndroidBridge = true;
              document.addEventListener('click', function (event) {
                var node = event.target;
                while (node && node !== document && !(node.getAttribute && node.getAttribute('download'))) {
                  node = node.parentNode;
                }
                if (!node || node === document) { return; }
                var href = node.href || '';
                if (href.indexOf('blob:') !== 0) { return; }
                event.preventDefault();
                event.stopPropagation();
                var name = node.getAttribute('download') || 'conway-life-export.json';
                fetch(href).then(function (response) { return response.text(); }).then(function (text) {
                  window.ConwayAndroid.saveFile(name, text);
                }).catch(function () {
                  window.ConwayAndroid.saveFile(name, '');
                });
              }, true);
            })();
        """.trimIndent()
    }
}
