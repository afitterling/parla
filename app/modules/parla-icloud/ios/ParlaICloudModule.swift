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
  // The app's iCloud container id. Must match the entitlement /
  // NSUbiquitousContainers key and the Mac app's container path.
  private let containerId = "iCloud.com.afitterling.sprachapp"

  public func definition() -> ModuleDefinition {
    Name("ParlaICloud")

    AsyncFunction("isAvailable") { () -> Bool in
      self.documentsURL() != nil
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
