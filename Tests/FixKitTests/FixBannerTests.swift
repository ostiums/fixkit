import Testing
@testable import FixKit

struct FixBannerTests {
    @Test func bannersNameTheAgent() {
        #expect(FixBanners.sent(to: "Codex") == "Sent to Codex")
        #expect(FixBanners.fixing(by: "Codex") == "Codex is fixing it")
        #expect(FixBanners.fixed(by: "Codex") == "Fixed by Codex")
        #expect(FixBanners.stopped(by: "Codex") == "Not rebuilt: see Codex")
        #expect(FixBanners.queued(in: "Codex") == "Queued in Codex")
        #expect(FixBanners.notListening(agent: "Codex") == "Codex is not listening")
        #expect(FixBanners.composerHint(agent: "Codex") == "What should Codex fix here?")
    }

    @Test func noAgentHeardFromYet() {
        #expect(FixBanners.notListening(agent: nil) == "No agent is listening")
        #expect(FixBanners.composerHint(agent: nil) == "What needs fixing here?")
    }

    @Test func anAnswerWithoutAnAgentIsClaudeCode() {
        #expect(FixBanners.agent(from: nil) == "Claude Code")
        #expect(FixBanners.agent(from: "Codex") == "Codex")
    }
}
