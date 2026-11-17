package dev.cowatch.player;

import android.app.Activity;
import android.app.DownloadManager;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.ActivityInfo;
import android.content.res.Configuration;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
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
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;

public final class MainActivity extends Activity {
    private static final String HOME_URL = "https://cowatch-ai-danmaku-studio.yuguan2304.workers.dev/";
    private static final String TRUSTED_HOST = "cowatch-ai-danmaku-studio.yuguan2304.workers.dev";
    private static final int PICK_FILE = 501;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private WebView webView;
    private FrameLayout root;
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
