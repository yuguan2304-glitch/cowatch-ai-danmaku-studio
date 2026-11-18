package dev.cowatch.player;

import android.app.Activity;
import android.app.DownloadManager;
import android.content.ContentValues;
import android.content.ContentResolver;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.ActivityInfo;
import android.content.res.Configuration;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import androidx.webkit.WebMessageCompat;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import org.json.JSONObject;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.webkit.CookieManager;
import android.webkit.DownloadListener;
import android.webkit.URLUtil;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceError;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Button;
import android.view.Gravity;
import android.widget.Toast;

public final class MainActivity extends Activity {
    private static final String HOME_URL = "https://cowatch-ai-danmaku-studio.yuguan2304.workers.dev/";
    private static final String TRUSTED_HOST = "cowatch-ai-danmaku-studio.yuguan2304.workers.dev";
    private static final int PICK_FILE = 501;
    private static final int MAX_EXPORT_CHARS = 6 * 1024 * 1024;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private WebView webView;
    private FrameLayout root;
    private LinearLayout connectionErrorView;
    private long loadSequence = 0;
    private boolean mainPageFailed = false;
    private static final long STARTUP_TIMEOUT_MS = 15000;
    private View customVideo;
    private WebChromeClient.CustomViewCallback customVideoCallback;
    private ValueCallback<Uri[]> pendingFileChooser;
    private boolean cinemaMode = false;

    private final Runnable detectCinema = new Runnable() {
        @Override public void run() {
            if (webView == null) return;
            if (customVideo == null) {
                // Read top-level DOM only: no JavaScript bridge is exposed to third-party iframes.
                webView.evaluateJavascript(
                    "(function(){return !!document.querySelector('[data-fs=true]')})()",
                    value -> {
                        if (webView == null || customVideo != null) return;
                        boolean requested = "true".equals(value);
                        if (requested != cinemaMode) applyCinema(requested);
                    });
            }
            handler.postDelayed(this, 350);
        }
    };

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_PORTRAIT);
        getWindow().setStatusBarColor(0xff141110);
        getWindow().setNavigationBarColor(0xff141110);

        root = new FrameLayout(this);
        root.setBackgroundColor(0xff141110);
        webView = new WebView(this);
        root.addView(webView, new FrameLayout.LayoutParams(-1, -1));
        setContentView(root);
        buildConnectionErrorView();

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true);

        webView.setWebViewClient(new WebViewClient() {
            @Override public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
                super.onPageStarted(view, url, favicon);
                if (!url.startsWith("https://" + TRUSTED_HOST + "/")) return;
                mainPageFailed = false;
                final long attempt = ++loadSequence;
                hideConnectionError();
                handler.postDelayed(() -> {
                    if (webView != null && loadSequence == attempt && !mainPageFailed) {
                        webView.evaluateJavascript("(function(){var el=document.getElementById('root');return !!(el && el.children.length && el.innerText.trim().length)})()", value -> {
                            if (webView != null && loadSequence == attempt && !"true".equals(value)) {
                                showConnectionError("页面加载超时。当前网络可能无法访问共映的 Cloudflare 域名。");
                            }
                        });
                    }
                }, STARTUP_TIMEOUT_MS);
            }
            @Override public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                if (mainPageFailed || !url.startsWith("https://" + TRUSTED_HOST + "/")) return;
                final long attempt = loadSequence;
                // Even an HTTP 200 may render blank if a JS bundle fails to load.
                handler.postDelayed(() -> {
                    if (webView == null || loadSequence != attempt || mainPageFailed) return;
                    webView.evaluateJavascript("(function(){var el=document.getElementById('root');return !!(el && el.children.length && el.innerText.trim().length)})()", value -> {
                        if (webView == null || loadSequence != attempt) return;
                        if ("true".equals(value)) hideConnectionError();
                        else showConnectionError("网页已连接，但界面没有加载出来。可以重试或换网络。");
                    });
                }, 2500);
            }
            @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                super.onReceivedError(view, request, error);
                if (request.isForMainFrame()) {
                    mainPageFailed = true;
                    showConnectionError("无法连接共映网站（网络错误 " + error.getErrorCode() + "）。可能是当前网络无法访问 workers.dev。");
                }
            }
            @Override public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse response) {
                super.onReceivedHttpError(view, request, response);
                if (request.isForMainFrame() && response.getStatusCode() >= 400) {
                    mainPageFailed = true;
                    showConnectionError("共映网站返回 HTTP " + response.getStatusCode() + "，请重试或稍后再试。");
                }
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if (!request.isForMainFrame()) return false;
                Uri url = request.getUrl();
                if ("https".equals(url.getScheme()) && TRUSTED_HOST.equals(url.getHost())) return false;
                try { startActivity(new Intent(Intent.ACTION_VIEW, url)); }
                catch (Exception ignored) { Toast.makeText(MainActivity.this, "无法打开外部链接", Toast.LENGTH_SHORT).show(); }
                return true;
            }
        });
        webView.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (pendingFileChooser != null) pendingFileChooser.onReceiveValue(null);
                pendingFileChooser = callback;
                try {
                    startActivityForResult(params.createIntent(), PICK_FILE);
                    return true;
                } catch (ActivityNotFoundException ex) {
                    pendingFileChooser = null;
                    callback.onReceiveValue(null);
                    Toast.makeText(MainActivity.this, "找不到文件选择器", Toast.LENGTH_SHORT).show();
                    return false;
                }
            }

            @Override public void onShowCustomView(View view, CustomViewCallback callback) {
                if (customVideo != null) {
                    callback.onCustomViewHidden();
                    return;
                }
                customVideo = view;
                customVideoCallback = callback;
                webView.setVisibility(View.GONE);
                root.addView(view, new FrameLayout.LayoutParams(-1, -1));
                applyCinema(true);
            }

            @Override public void onHideCustomView() {
                hideCustomVideo();
            }
        });
        // Only the trusted CoWatch HTTPS origin can invoke the native file exporter.
        // Unlike addJavascriptInterface, this channel is not exposed to arbitrary iframes.
        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            WebViewCompat.addWebMessageListener(webView, "CoWatchExport",
                Collections.singleton("https://" + TRUSTED_HOST), (view, message, origin, mainFrame, reply) -> {
                    if (!mainFrame || !"https".equals(origin.getScheme())
                        || !TRUSTED_HOST.equals(origin.getHost())
                        || message.getType() != WebMessageCompat.TYPE_STRING) return;
                    String raw = message.getData();
                    if (raw == null || raw.length() > MAX_EXPORT_CHARS) {
                        handler.post(() -> Toast.makeText(this, "导出文件过大", Toast.LENGTH_LONG).show());
                        return;
                    }
                    try {
                        JSONObject data = new JSONObject(raw);
                        String name = data.optString("filename", "");
                        String mime = data.optString("mime", "");
                        String content = data.optString("content", "");
                        if (!("cowatch.json".equals(name) || "cowatch.xml".equals(name)
                                || "cowatch-worldbook.txt".equals(name)
                                || "cowatch-imported-worldbook.json".equals(name))
                            || !(mime.startsWith("application/json") || mime.startsWith("application/xml")
                                || mime.startsWith("text/plain"))) return;
                        byte[] bytes = content.getBytes(StandardCharsets.UTF_8);
                        if (bytes.length > MAX_EXPORT_CHARS) return;
                        handler.post(() -> saveLocalExport(name, mime, bytes));
                    } catch (Exception ignored) {
                        handler.post(() -> Toast.makeText(this, "导出数据解析失败", Toast.LENGTH_SHORT).show());
                    }
                });
        }

        webView.setDownloadListener((url, userAgent, contentDisposition, mimeType, contentLength) -> {
            Uri uri = Uri.parse(url);
            if (!"https".equals(uri.getScheme())) {
                Toast.makeText(this, "仅支持 HTTPS 下载", Toast.LENGTH_SHORT).show();
                return;
            }
            try {
                DownloadManager.Request request = new DownloadManager.Request(uri);
                request.setMimeType(mimeType);
                request.addRequestHeader("User-Agent", userAgent);
                String cookies = CookieManager.getInstance().getCookie(url);
                if (cookies != null) request.addRequestHeader("Cookie", cookies);
                request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                String filename = URLUtil.guessFileName(url, contentDisposition, mimeType);
                request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, filename);
                ((DownloadManager) getSystemService(DOWNLOAD_SERVICE)).enqueue(request);
                Toast.makeText(this, "已交给系统下载管理器", Toast.LENGTH_SHORT).show();
            } catch (Exception ex) {
                Toast.makeText(this, "下载失败，请尝试在浏览器打开链接", Toast.LENGTH_LONG).show();
            }
        });

        if (state == null) webView.loadUrl(HOME_URL);
        else webView.restoreState(state);
        handler.postDelayed(detectCinema, 500);
    }

    private void buildConnectionErrorView() {
        connectionErrorView = new LinearLayout(this);
        connectionErrorView.setOrientation(LinearLayout.VERTICAL);
        connectionErrorView.setGravity(Gravity.CENTER);
        connectionErrorView.setPadding(40, 40, 40, 40);
        connectionErrorView.setBackgroundColor(0xff141110);
        TextView message = new TextView(this);
        message.setTag("connection-message");
        message.setTextColor(0xfff6e7d4);
        message.setTextSize(16);
        message.setGravity(Gravity.CENTER);
        connectionErrorView.addView(message, new LinearLayout.LayoutParams(-1, -2));
        Button retry = new Button(this);
        retry.setText("重新连接");
        retry.setOnClickListener(v -> {
            hideConnectionError();
            if (webView != null) webView.loadUrl(HOME_URL);
        });
        connectionErrorView.addView(retry, new LinearLayout.LayoutParams(-2, -2));
        Button browser = new Button(this);
        browser.setText("在浏览器中打开");
        browser.setOnClickListener(v -> {
            try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(HOME_URL))); }
            catch (Exception ignored) { Toast.makeText(this, "无法启动浏览器", Toast.LENGTH_SHORT).show(); }
        });
        connectionErrorView.addView(browser, new LinearLayout.LayoutParams(-2, -2));
        TextView note = new TextView(this);
        note.setText("这不是 API 密钥的问题。共映当前使用 Cloudflare 默认域名，在部分网络中可能无法连接。请勿卸载应用或清除数据，以免丢失本地收藏。");
        note.setTextSize(12);
        note.setTextColor(0xffb8aaa0);
        note.setGravity(Gravity.CENTER);
        connectionErrorView.addView(note, new LinearLayout.LayoutParams(-1, -2));
        connectionErrorView.setVisibility(View.GONE);
        root.addView(connectionErrorView, new FrameLayout.LayoutParams(-1, -1));
    }

    private void showConnectionError(String reason) {
        if (connectionErrorView == null || customVideo != null) return;
        TextView message = (TextView) connectionErrorView.findViewWithTag("connection-message");
        if (message != null) message.setText("共映暂时无法进入\\n\\n" + reason);
        connectionErrorView.setVisibility(View.VISIBLE);
        connectionErrorView.bringToFront();
    }

    private void hideConnectionError() {
        if (connectionErrorView != null) connectionErrorView.setVisibility(View.GONE);
    }

    // Downloads provider handles scoped storage on Android 10+ without broad permissions.
    private void saveLocalExport(String name, String mime, byte[] bytes) {
        if (Build.VERSION.SDK_INT < 29) {
            Toast.makeText(this, "系统版本较旧，请使用网页版导出", Toast.LENGTH_LONG).show();
            return;
        }
        ContentResolver resolver = getContentResolver();
        Uri item = null;
        try {
            ContentValues values = new ContentValues();
            values.put(MediaStore.Downloads.DISPLAY_NAME, name);
            values.put(MediaStore.Downloads.MIME_TYPE, mime);
            values.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/CoWatch");
            values.put(MediaStore.Downloads.IS_PENDING, 1);
            item = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
            if (item == null) throw new IllegalStateException("无法创建下载文件");
            try (OutputStream stream = resolver.openOutputStream(item)) {
                if (stream == null) throw new IllegalStateException("无法打开下载文件");
                stream.write(bytes);
            }
            ContentValues ready = new ContentValues();
            ready.put(MediaStore.Downloads.IS_PENDING, 0);
            resolver.update(item, ready, null, null);
            Toast.makeText(this, "已保存到 下载/CoWatch/" + name, Toast.LENGTH_LONG).show();
        } catch (Exception ex) {
            if (item != null) resolver.delete(item, null, null);
            Toast.makeText(this, "文件导出失败，请检查存储空间", Toast.LENGTH_LONG).show();
        }
    }

    private void hideCustomVideo() {
        if (customVideo == null) return;
        root.removeView(customVideo);
        customVideo = null;
        webView.setVisibility(View.VISIBLE);
        if (customVideoCallback != null) customVideoCallback.onCustomViewHidden();
        customVideoCallback = null;
        applyCinema(false);
    }

    private void applyCinema(boolean enabled) {
        cinemaMode = enabled;
        if (enabled) {
            setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE);
        } else {
            setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_PORTRAIT);
        }

        if (Build.VERSION.SDK_INT >= 30) {
            WindowInsetsController controller = getWindow().getInsetsController();
            if (controller != null) {
                int bars = WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars();
                if (enabled) {
                    controller.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
                    controller.hide(bars);
                } else controller.show(bars);
            }
        } else {
            getWindow().getDecorView().setSystemUiVisibility(enabled
                ? View.SYSTEM_UI_FLAG_FULLSCREEN
                    | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                    | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                    | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                    | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                    | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                : View.SYSTEM_UI_FLAG_VISIBLE);
        }
    }

    @Override public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        if (cinemaMode) applyCinema(true);
    }

    @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == PICK_FILE && pendingFileChooser != null) {
            pendingFileChooser.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data));
            pendingFileChooser = null;
        }
    }

    @Override public void onBackPressed() {
        if (customVideo != null) { hideCustomVideo(); return; }
        if (cinemaMode) {
            webView.evaluateJavascript("window.dispatchEvent(new Event('cowatch:toggle-fullscreen'))", null);
            return;
        }
        if (webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }

    @Override protected void onSaveInstanceState(Bundle outState) {
        webView.saveState(outState);
        super.onSaveInstanceState(outState);
    }

    @Override protected void onDestroy() {
        handler.removeCallbacks(detectCinema);
        if (pendingFileChooser != null) pendingFileChooser.onReceiveValue(null);
        pendingFileChooser = null;
        if (webView != null) {
            root.removeView(webView);
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}
