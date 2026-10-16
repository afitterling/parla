import ExpoModulesCore
import Foundation

// Reads and writes small JSON files ("vocab.json", "phrases.json", …) in the app's
// iCloud "Documents" ubiquity container. That container is shared with the Mac
// (Electron) app, which reads/writes the same folder, giving cross-device sync.
//
// All file access is coordinated with NSFileCoordinator so a write on one device
// and a sync-in from another can't corrupt the file. Reads first trigger a
// download if only a not-yet-materialized iCloud placeholder is present.
public final class ParlaICloudModule: Module {
  // The app's iCloud container id, derived from the bundle id so each identity
  // owns its own library: tech.sp33c.parla.dev → iCloud.tech.sp33c.parla.dev.
  // A dev build therefore cannot scribble over the store the shipping app uses,
  // and switching identity is not a migration — the new container starts empty
  // and Settings → Backup moves a library across deliberately.
  // scripts/setBundleId.sh keeps the entitlement and the NSUbiquitousContainers
  // key in step; Settings shows the resolved value via containerId() below.
  private var containerId: String {
    "iCloud." + (Bundle.main.bundleIdentifier ?? "com.afitterling.sprachapp")
  }

  public func definition() -> ModuleDefinition {
    Name("ParlaICloud")

    AsyncFunction("isAvailable") { () -> Bool in
      self.documentsURL() != nil
    }

    // Surfaced in Settings: which container this build actually talks to. When
    // a build appears to have lost its library, this is the first thing to check.
    Function("containerId") { () -> String in
      self.containerId
    }

    AsyncFunction("readFile") { (name: String) -> String? in
      guard let url = try self.fileURL(name) else { return nil }
      return self.read(url)
    }

    AsyncFunction("writeFile") { (name: String, content: String) in
      guard let url = try self.fileURL(name) else {
        throw ICloudUnavailableException()
      }
      try self.write(url, content)
    }
  }

  // MARK: - Paths

  private func documentsURL() -> URL? {
    // Blocking; Expo runs AsyncFunction bodies off the main thread, so this is fine.
    guard let base = FileManager.default.url(forUbiquityContainerIdentifier: containerId) else {
      return nil
    }
    let docs = base.appendingPathComponent("Documents", isDirectory: true)
    try? FileManager.default.createDirectory(at: docs, withIntermediateDirectories: true)
    return docs
  }

  private func fileURL(_ name: String) throws -> URL? {
    guard isSafeName(name) else { throw InvalidNameException(name) }
    guard let docs = documentsURL() else { return nil }
    return docs.appendingPathComponent(name)
  }

  // Callers only ever pass a bare "<key>.json" file name — reject anything else.
  private func isSafeName(_ name: String) -> Bool {
    if name.hasPrefix(".") { return false }
    return name.range(of: "^[A-Za-z0-9._-]+$", options: .regularExpression) != nil
  }

  // MARK: - IO

  private func read(_ file: URL) -> String? {
    // If the local copy hasn't been downloaded yet, ask iCloud for it and wait
    // briefly for it to materialize.
    if !FileManager.default.fileExists(atPath: file.path) {
      try? FileManager.default.startDownloadingUbiquitousItem(at: file)
      let deadline = Date().addingTimeInterval(8)
      while !FileManager.default.fileExists(atPath: file.path), Date() < deadline {
        Thread.sleep(forTimeInterval: 0.2)
      }
      if !FileManager.default.fileExists(atPath: file.path) { return nil }
    }

    var result: String?
    var coordError: NSError?
    NSFileCoordinator().coordinate(readingItemAt: file, options: [], error: &coordError) { url in
      result = try? String(contentsOf: url, encoding: .utf8)
    }
    return result
  }

  private func write(_ file: URL, _ content: String) throws {
    var coordError: NSError?
    var writeError: Error?
    NSFileCoordinator().coordinate(writingItemAt: file, options: .forReplacing, error: &coordError) { url in
      do {
        try content.data(using: .utf8)?.write(to: url, options: .atomic)
      } catch {
        writeError = error
      }
    }
    if let coordError { throw coordError }
    if let writeError { throw writeError }
  }
}

private final class ICloudUnavailableException: Exception {
  override var reason: String {
    "iCloud is not available (signed out or iCloud Drive disabled)."
  }
}

private final class InvalidNameException: GenericException<String> {
  override var reason: String {
    "Invalid storage file name: \(param)"
  }
}
