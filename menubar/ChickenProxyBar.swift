import Cocoa
import Foundation
import WebKit

let kProjectDir   = "__PROJECT_DIR__"
let kPidFile      = "/tmp/chickenproxy.pid"
let kProxyPidFile = "/tmp/chickenproxy-proxy.pid"
let kDashboardURL = "http://localhost:4444"

func isRunning() -> Bool {
    guard FileManager.default.fileExists(atPath: kProxyPidFile),
          let content = try? String(contentsOfFile: kProxyPidFile, encoding: .utf8) else { return false }
    return content.split(separator: "\n")
        .compactMap { Int32($0.trimmingCharacters(in: .whitespaces)) }
        .filter { $0 > 0 }
        .contains { kill($0, 0) == 0 }
}

func runScript(_ name: String) {
    let p = Process()
    p.launchPath = "/bin/bash"
    p.arguments  = ["\(kProjectDir)/\(name)"]
    try? p.run()
}

// ── Dashboard window ───────────────────────────────────────────────────────────

class DashboardWindowController: NSWindowController, WKNavigationDelegate, NSWindowDelegate {
    private var webView: WKWebView!
    private var retryTimer: Timer?
    private var loadingView: NSView!

    init() {
        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 1280, height: 820),
            styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView],
            backing: .buffered,
            defer: false
        )
        window.title = "ProxyChicken"
        window.minSize = NSSize(width: 800, height: 500)
        window.setFrameAutosaveName("DashboardWindow")
        window.center()

        super.init(window: window)
        window.delegate = self

        let content = window.contentView!

        // WebView
        let config = WKWebViewConfiguration()
        webView = WKWebView(frame: .zero, configuration: config)
        webView.translatesAutoresizingMaskIntoConstraints = false
        webView.navigationDelegate = self
        content.addSubview(webView)

        // Loading overlay
        loadingView = makeLoadingView()
        loadingView.translatesAutoresizingMaskIntoConstraints = false
        content.addSubview(loadingView)

        NSLayoutConstraint.activate([
            webView.topAnchor.constraint(equalTo: content.topAnchor),
            webView.bottomAnchor.constraint(equalTo: content.bottomAnchor),
            webView.leadingAnchor.constraint(equalTo: content.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: content.trailingAnchor),

            loadingView.topAnchor.constraint(equalTo: content.topAnchor),
            loadingView.bottomAnchor.constraint(equalTo: content.bottomAnchor),
            loadingView.leadingAnchor.constraint(equalTo: content.leadingAnchor),
            loadingView.trailingAnchor.constraint(equalTo: content.trailingAnchor),
        ])
    }

    required init?(coder: NSCoder) { fatalError() }

    private func makeLoadingView() -> NSView {
        let bg = NSView()
        bg.wantsLayer = true
        bg.layer?.backgroundColor = NSColor(red: 0.1, green: 0.1, blue: 0.12, alpha: 1).cgColor

        let label = NSTextField(labelWithString: "🐔  Starting ProxyChicken…")
        label.font = .systemFont(ofSize: 16, weight: .medium)
        label.textColor = .secondaryLabelColor
        label.translatesAutoresizingMaskIntoConstraints = false
        bg.addSubview(label)

        NSLayoutConstraint.activate([
            label.centerXAnchor.constraint(equalTo: bg.centerXAnchor),
            label.centerYAnchor.constraint(equalTo: bg.centerYAnchor),
        ])
        return bg
    }

    func open() {
        showWindow(nil)
        NSApp.activate(ignoringOtherApps: true)
        loadDashboard()
    }

    private func loadDashboard() {
        retryTimer?.invalidate()
        retryTimer = nil
        webView.load(URLRequest(url: URL(string: kDashboardURL)!))
    }

    // Navigation callbacks

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        loadingView.isHidden = true
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation _: WKNavigation!, withError _: Error) {
        loadingView.isHidden = false
        retryTimer = Timer.scheduledTimer(withTimeInterval: 2, repeats: false) { [weak self] _ in
            self?.loadDashboard()
        }
    }

    // Keep window object alive after closing so we can reuse it
    func windowShouldClose(_ sender: NSWindow) -> Bool {
        window?.orderOut(nil)
        return false
    }

    func bringToFront() {
        window?.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }
}

// ── App delegate ───────────────────────────────────────────────────────────────

class AppDelegate: NSObject, NSApplicationDelegate {
    var statusItem: NSStatusItem!
    var statusMenuItem: NSMenuItem!
    var toggleMenuItem: NSMenuItem!
    var timer: Timer?
    var animTimer: Timer?
    var frameIndex = 0
    var wasRunning = false
    let runFrames = ["🐔", "🐓", "🐔", "🐤", "🍗", "🐤", "🐔", "🥚"]
    var dashboardWC: DashboardWindowController?

    private func bundleImage(named base: String) -> NSImage? {
        let imgDir = Bundle.main.resourceURL?.appendingPathComponent("img")
        let ext = (base as NSString).pathExtension
        let stem = (base as NSString).deletingPathExtension

        guard let url1x = imgDir?.appendingPathComponent(base),
              let data1x = try? Data(contentsOf: url1x),
              let rep1x = NSBitmapImageRep(data: data1x) else { return nil }

        let img = NSImage()
        img.addRepresentation(rep1x)

        let name2x = "\(stem)@2x.\(ext)"
        if let url2x = imgDir?.appendingPathComponent(name2x),
           let data2x = try? Data(contentsOf: url2x),
           let rep2x = NSBitmapImageRep(data: data2x) {
            rep2x.size = NSSize(width: rep2x.pixelsWide / 2, height: rep2x.pixelsHigh / 2)
            img.addRepresentation(rep2x)
        }

        img.isTemplate = true
        return img
    }

    func applicationDidFinishLaunching(_: Notification) {
        let others = NSRunningApplication.runningApplications(withBundleIdentifier: "com.chickenproxy.menubar")
            .filter { $0 != NSRunningApplication.current }
        if !others.isEmpty {
            NSApp.terminate(nil)
            return
        }

        NSApp.setActivationPolicy(.accessory)

        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        statusItem.button?.font = NSFont.systemFont(ofSize: 14)
        setStoppedIcon()

        let menu = NSMenu()

        statusMenuItem = NSMenuItem(title: "○ Stopped", action: nil, keyEquivalent: "")
        statusMenuItem.isEnabled = false
        menu.addItem(statusMenuItem)

        menu.addItem(.separator())

        toggleMenuItem = NSMenuItem(title: "Start ProxyChicken", action: #selector(toggle), keyEquivalent: "")
        toggleMenuItem.target = self
        menu.addItem(toggleMenuItem)

        let openItem = NSMenuItem(title: "Open Dashboard", action: #selector(openDashboard), keyEquivalent: "o")
        openItem.target = self
        menu.addItem(openItem)

        menu.addItem(.separator())

        let copyItem = NSMenuItem(title: "Copy Proxy Address", action: #selector(copyProxyAddress), keyEquivalent: "c")
        copyItem.target = self
        menu.addItem(copyItem)

        menu.addItem(.separator())

        let quitItem = NSMenuItem(title: "Quit", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        menu.addItem(quitItem)

        statusItem.menu = menu
        refresh()

        timer = Timer.scheduledTimer(withTimeInterval: 3, repeats: true) { [weak self] _ in
            self?.refresh()
        }
    }

    func refresh() {
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            let running = isRunning()
            if running {
                let dot = NSAttributedString(string: "● ", attributes: [.foregroundColor: NSColor.systemGreen])
                let rest = NSAttributedString(string: "Running")
                let full = NSMutableAttributedString(attributedString: dot)
                full.append(rest)
                self.statusMenuItem.attributedTitle = full
                self.toggleMenuItem.title = "Stop ProxyChicken"
                if !self.wasRunning { self.startAnimation() }
            } else {
                self.statusMenuItem.attributedTitle = nil
                self.statusMenuItem.title = "○ Stopped"
                self.toggleMenuItem.title = "Start ProxyChicken"
                if self.wasRunning {
                    self.stopAnimation()
                } else if !self.wasRunning {
                    self.setStoppedIcon()
                }
            }
            self.wasRunning = running
        }
    }

    private func setStoppedIcon() {
        if let img = bundleImage(named: "ProxyPausedTemplate.png") {
            statusItem.button?.image = img
            statusItem.button?.title = ""
        } else {
            statusItem.button?.image = nil
            statusItem.button?.title = "🐔💤"
        }
    }

    private func setRunningIcon() {
        if let img = bundleImage(named: "ProxyActiveTemplate.png") {
            statusItem.button?.image = img
            statusItem.button?.title = ""
        } else {
            statusItem.button?.image = nil
            statusItem.button?.title = runFrames[frameIndex]
        }
    }

    func startAnimation() {
        frameIndex = 0
        animTimer?.invalidate()
        setRunningIcon()
        guard bundleImage(named: "ProxyActiveTemplate.png") == nil else { return }
        animTimer = Timer.scheduledTimer(withTimeInterval: 0.35, repeats: true) { [weak self] _ in
            guard let self else { return }
            self.frameIndex = (self.frameIndex + 1) % self.runFrames.count
            self.statusItem.button?.title = self.runFrames[self.frameIndex]
        }
    }

    func stopAnimation() {
        animTimer?.invalidate()
        animTimer = nil
        setStoppedIcon()
    }

    @objc func toggle() {
        if isRunning() {
            runScript("stop.sh")
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { [weak self] in self?.refresh() }
        } else {
            runScript("start.sh")
            DispatchQueue.main.asyncAfter(deadline: .now() + 5) { [weak self] in self?.refresh() }
        }
    }

    func applicationWillTerminate(_: Notification) {
        if isRunning() {
            let p = Process()
            p.launchPath = "/bin/bash"
            p.arguments = ["\(kProjectDir)/stop.sh"]
            try? p.run()
            p.waitUntilExit()
        }
    }

    @objc func copyProxyAddress() {
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString("127.0.0.1:8888", forType: .string)
    }

    @objc func openDashboard() {
        if dashboardWC == nil {
            dashboardWC = DashboardWindowController()
        }
        if dashboardWC?.window?.isVisible == true {
            dashboardWC?.bringToFront()
        } else {
            dashboardWC?.open()
        }
    }
}

let app      = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.run()
