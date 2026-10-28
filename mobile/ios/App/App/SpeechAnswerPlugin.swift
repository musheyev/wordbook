import Foundation
import AVFoundation
import Speech
import Capacitor

/// Spoken quiz answers, for the app's JavaScript (web/src/client/native/speech.js),
/// as the Capacitor plugin "SpeechAnswer".
///
/// listen() hears one answer through the microphone and turns it into text
/// with Apple's own speech recognition (the Speech framework). Where the
/// iPhone can do that by itself — Spanish, English, French, Italian, German
/// on recent iPhones — it's told to (`requiresOnDeviceRecognition`): nothing
/// leaves the phone, it costs nothing and it works offline. speak() says a
/// short reply ("Correct") with the iPhone's built-in voice.
///
/// How the listening works:
///   - AVAudioEngine gives the microphone's sound in small buffers; each one
///     is handed to a recognition "request", which keeps guessing the words
///     so far (partial results, sent to JavaScript as "partial" events so the
///     card can show them as you speak).
///   - `contextualStrings` tells the recogniser which words to expect (the
///     card's answer), which helps a lot with short foreign phrases.
///   - The answer is over when you pause: 1.5 seconds with no new words
///     after you've said something, or 6 seconds of nothing at all, or 15
///     seconds in all. stop() (tapping the microphone again) ends it at once.
///
/// The audio session: iOS lets an app either only play sound or play and
/// record. While listening it's switched to play-and-record; afterwards it's
/// put back to what AppDelegate set up for read-aloud (`.playback`,
/// `.spokenAudio`), so the card's audio plays as before.
@objc(SpeechAnswerPlugin)
public class SpeechAnswerPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SpeechAnswerPlugin"
    public let jsName = "SpeechAnswer"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "listen", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "speak", returnType: CAPPluginReturnPromise)
    ]

    private let engine = AVAudioEngine()
    private var request: SFSpeechAudioBufferRecognitionRequest?
    private var task: SFSpeechRecognitionTask?
    private var call: CAPPluginCall? // the listen() waiting for its answer
    private var heard = ""
    private var pauseTimer: Timer?
    private var limitTimer: Timer?
    private let synthesizer = AVSpeechSynthesizer()

    private static let pauseAfterWords: TimeInterval = 1.5
    private static let waitForWords: TimeInterval = 6
    private static let longest: TimeInterval = 15

    /// listen({ lang: "es-ES", hints: ["Yo estoy"] }) -> { text }: what was
    /// heard ("" for nothing). Rejects with code "DENIED" when the microphone
    /// or speech recognition isn't allowed, "UNAVAILABLE" when the iPhone
    /// can't recognise that language.
    @objc func listen(_ call: CAPPluginCall) {
        let lang = call.getString("lang") ?? "en-US"
        let hints = (call.getArray("hints") as? [String]) ?? []
        askPermission { allowed in
            DispatchQueue.main.async {
                guard allowed else {
                    call.reject("The microphone or speech recognition isn't allowed", "DENIED")
                    return
                }
                self.start(call, lang: lang, hints: hints)
            }
        }
    }

    /// stop(): finish listening now; the waiting listen() gets what was heard.
    @objc func stop(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.finish()
            call.resolve()
        }
    }

    /// speak({ text, lang }): say a short reply, without waiting for it.
    @objc func speak(_ call: CAPPluginCall) {
        let text = call.getString("text") ?? ""
        let lang = call.getString("lang") ?? "en-US"
        DispatchQueue.main.async {
            let utterance = AVSpeechUtterance(string: text)
            utterance.voice = AVSpeechSynthesisVoice(language: lang)
            self.synthesizer.stopSpeaking(at: .immediate)
            self.synthesizer.speak(utterance)
            call.resolve()
        }
    }

    // MARK: - Listening

    /// Speech recognition and the microphone each have their own "Allow?"
    /// question, asked the first time only (the answers are in Info.plist's
    /// NSSpeechRecognitionUsageDescription / NSMicrophoneUsageDescription).
    private func askPermission(_ done: @escaping (Bool) -> Void) {
        SFSpeechRecognizer.requestAuthorization { status in
            guard status == .authorized else { done(false); return }
            AVAudioSession.sharedInstance().requestRecordPermission { granted in done(granted) }
        }
    }

    private func start(_ call: CAPPluginCall, lang: String, hints: [String]) {
        finish() // one answer at a time
        guard let recognizer = SFSpeechRecognizer(locale: Locale(identifier: lang)), recognizer.isAvailable else {
            call.reject("Speech recognition isn't available for \(lang)", "UNAVAILABLE")
            return
        }
        let request = SFSpeechAudioBufferRecognitionRequest()
        request.shouldReportPartialResults = true
        request.contextualStrings = hints
        if recognizer.supportsOnDeviceRecognition { request.requiresOnDeviceRecognition = true }

        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playAndRecord, mode: .measurement, options: [.defaultToSpeaker, .duckOthers])
            try session.setActive(true, options: .notifyOthersOnDeactivation)
            let input = engine.inputNode
            input.removeTap(onBus: 0)
            input.installTap(onBus: 0, bufferSize: 1024, format: input.outputFormat(forBus: 0)) { buffer, _ in
                request.append(buffer)
            }
            engine.prepare()
            try engine.start()
        } catch {
            restoreAudio()
            call.reject("Couldn't use the microphone: \(error.localizedDescription)")
            return
        }

        self.call = call
        self.request = request
        heard = ""
        task = recognizer.recognitionTask(with: request) { [weak self] result, error in
            DispatchQueue.main.async {
                guard let self = self, self.request === request else { return }
                if let result = result {
                    self.heard = result.bestTranscription.formattedString
                    self.notifyListeners("partial", data: ["text": self.heard])
                    if result.isFinal { self.finish(); return }
                    self.restartPauseTimer(Self.pauseAfterWords)
                }
                if error != nil { self.finish() }
            }
        }
        restartPauseTimer(Self.waitForWords)
        limitTimer = Timer.scheduledTimer(withTimeInterval: Self.longest, repeats: false) { [weak self] _ in
            self?.finish()
        }
    }

    private func restartPauseTimer(_ seconds: TimeInterval) {
        pauseTimer?.invalidate()
        pauseTimer = Timer.scheduledTimer(withTimeInterval: seconds, repeats: false) { [weak self] _ in
            self?.finish()
        }
    }

    /// Stop listening and answer the waiting listen() with what was heard.
    private func finish() {
        pauseTimer?.invalidate()
        limitTimer?.invalidate()
        pauseTimer = nil
        limitTimer = nil
        if engine.isRunning {
            engine.stop()
            engine.inputNode.removeTap(onBus: 0)
        }
        request?.endAudio()
        task?.cancel()
        request = nil
        task = nil
        if let call = call {
            self.call = nil
            restoreAudio()
            call.resolve(["text": heard])
        }
    }

    /// Back to read-aloud's audio session (see AppDelegate).
    private func restoreAudio() {
        do {
            try AVAudioSession.sharedInstance().setCategory(.playback, mode: .spokenAudio)
        } catch {
            print("Could not restore the audio session: \(error)")
        }
    }
}
