import assert from "node:assert/strict";
import test from "node:test";
import * as capability from "../../../src/capabilities/localisation/communitytranslationcontribution.ts";

test("communitytranslationcontributioncontracts", () => {
  const contract = capability.getTranslationContract();

  assert.equal(contract.repository, "anqr-translations");
  assert.ok(contract.interfaceStrings.length > 0);
  assert.ok(contract.staticContent.length > 0);
  assert.ok(contract.placeholderTokens.length > 0);
  assert.ok(contract.linkSyntaxTokens.length > 0);

  assert.ok(contract.interfaceStrings.includes("app.title"));
  assert.ok(contract.interfaceStrings.includes("nav.home"));
  assert.ok(!contract.interfaceStrings.includes("welcome.message"));

  assert.ok(contract.staticContent.includes("welcome.message"));
  assert.ok(contract.staticContent.includes("footer.copyright"));
  assert.ok(!contract.staticContent.includes("app.title"));

  assert.ok(contract.placeholderTokens.includes("{{username}}"));
  assert.ok(contract.placeholderTokens.includes("{{date}}"));
  assert.ok(contract.placeholderTokens.includes("{{count}}"));

  assert.ok(contract.linkSyntaxTokens.includes("[link](url)"));
  assert.ok(contract.linkSyntaxTokens.includes("<a href=\"url\">"));
  assert.ok(contract.linkSyntaxTokens.includes("[[wiki.link]]"));
});

test("communitytranslationcontributionlifecycle", () => {
  const translation = capability.proposeTranslation(
    "translation-1",
    "Hello {{username}}, visit [link](url)"
  );

  assert.equal(translation.state, "proposal");
  assert.equal(
    capability.getLifecycleStep(translation),
    "Translation proposed - awaiting review"
  );

  const submitted = capability.submitForReview(translation);
  assert.ok(submitted.success);
  if (submitted.success) {
    assert.equal(submitted.translation.state, "review");
    assert.equal(submitted.translation.reviewStatus, "pending");
    assert.equal(
      capability.getLifecycleStep(submitted.translation),
      "Under review (pending)"
    );
  }

  const approved = {
    ...submitted.success ? submitted.translation : translation,
    reviewStatus: "approved" as const,
  };
  const merged = capability.approveForMerge(approved);
  assert.ok(merged.success);
  if (merged.success) {
    assert.equal(merged.translation.state, "merge");
    assert.ok(merged.translation.mergedAt !== undefined);
    assert.equal(
      capability.getLifecycleStep(merged.translation),
      "Approved and merged - ready for publication"
    );
  }

  const preservationContent = "Hello {{username}}, welcome to [link](url) and <a href=\"url\"> and [[wiki.link]] and {{date}} and {{count}}";
  const publishableTranslation = capability.proposeTranslation(
    "translation-2",
    preservationContent
  );
  const submittedForReview = capability.submitForReview(publishableTranslation);
  assert.ok(submittedForReview.success);
  if (submittedForReview.success) {
    const approvedTranslation = {
      ...submittedForReview.translation,
      reviewStatus: "approved" as const,
    };
    const mergedTranslation = capability.approveForMerge(approvedTranslation);
    assert.ok(mergedTranslation.success);
    if (mergedTranslation.success) {
      const published = capability.publishTranslation(mergedTranslation.translation);
      assert.ok(published.success);
      if (published.success) {
        assert.equal(published.translation.state, "publication");
        assert.ok(published.translation.publishedAt !== undefined);
        assert.equal(
          capability.getLifecycleStep(published.translation),
          "Published with next release"
        );
      }
    }
  }
});

test("communitytranslationcontributionpermissions", () => {
  const translation = capability.proposeTranslation(
    "translation-3",
    "Hello {{username}}, visit [link](url)"
  );
  assert.equal(translation.state, "proposal");
  assert.ok(capability.validateProposal(translation));

  const rejected = capability.rejectTranslation(translation);
  assert.ok(!rejected.success);
  if (!rejected.success) {
    assert.ok(rejected.error.includes("not in review state"));
  }

  const submitted = capability.submitForReview(translation);
  assert.ok(submitted.success);
  if (submitted.success) {
    assert.equal(submitted.translation.state, "review");
    assert.ok(!capability.validatePublication(submitted.translation));
  }

  const unapprovedMerge = capability.approveForMerge(
    submitted.success ? submitted.translation : translation
  );
  assert.ok(!unapprovedMerge.success);
  if (!unapprovedMerge.success) {
    assert.ok(unapprovedMerge.error.includes("has not been approved for merge"));
  }

  const approvedTranslation = {
    ...(submitted.success ? submitted.translation : translation),
    reviewStatus: "approved" as const,
  };
  const merged = capability.approveForMerge(approvedTranslation);
  assert.ok(merged.success);
  if (merged.success) {
    assert.equal(merged.translation.state, "merge");
    assert.ok(capability.validatePublication(merged.translation));
  }

  const unpublished = capability.publishTranslation(
    merged.success ? merged.translation : translation
  );
  assert.ok(!unpublished.success);
  if (!unpublished.success) {
    assert.ok(unpublished.error.includes("failed preservation validation"));
  }

  const preservationContent = "Hello {{username}}, welcome to [link](url) and <a href=\"url\"> and [[wiki.link]] and {{date}} and {{count}}";
  const publishable = capability.proposeTranslation(
    "translation-4",
    preservationContent
  );
  const submittedPublishable = capability.submitForReview(publishable);
  assert.ok(submittedPublishable.success);
  if (submittedPublishable.success) {
    const approvedPublishable = {
      ...submittedPublishable.translation,
      reviewStatus: "approved" as const,
    };
    const mergedPublishable = capability.approveForMerge(approvedPublishable);
    assert.ok(mergedPublishable.success);
    if (mergedPublishable.success) {
      const published = capability.publishTranslation(mergedPublishable.translation);
      assert.ok(published.success);
      if (published.success) {
        assert.equal(published.translation.state, "publication");
      }
    }
  }
});

test("communitytranslationcontributionuisemantics", () => {
  const invitationEn = capability.getInvitationMessage("en");
  assert.ok(invitationEn.includes("Help translate ANQR"));
  assert.ok(invitationEn.length > 0);

  const invitationEs = capability.getInvitationMessage("es");
  assert.ok(invitationEs.includes("Ayuda a traducir ANQR"));
  assert.ok(invitationEs !== invitationEn);

  const invitationFr = capability.getInvitationMessage("fr");
  assert.ok(invitationFr.includes("Aidez à traduire ANQR"));
  assert.ok(invitationFr !== invitationEn);

  const invitationDe = capability.getInvitationMessage("de");
  assert.ok(invitationDe.includes("Helfen Sie, ANQR"));
  assert.ok(invitationDe !== invitationEn);

  const invitationJa = capability.getInvitationMessage("ja");
  assert.ok(invitationJa.includes("ANQR"));
  assert.ok(invitationJa !== invitationEn);

  const invitationZh = capability.getInvitationMessage("zh");
  assert.ok(invitationZh.includes("ANQR"));
  assert.ok(invitationZh !== invitationEn);

  const allMessages = [
    invitationEn,
    invitationEs,
    invitationFr,
    invitationDe,
    invitationJa,
    invitationZh,
  ];
  assert.equal(new Set(allMessages).size, allMessages.length);
});

test("communitytranslationcontributionvalidation", () => {
  const invalidTranslation = capability.proposeTranslation(
    "translation-5",
    "Hello {{username}}, visit [link](url)"
  );
  const submittedInvalid = capability.submitForReview(invalidTranslation);
  assert.ok(submittedInvalid.success);
  if (submittedInvalid.success) {
    const approvedInvalid = {
      ...submittedInvalid.translation,
      reviewStatus: "approved" as const,
    };
    const mergedInvalid = capability.approveForMerge(approvedInvalid);
    assert.ok(mergedInvalid.success);
    if (mergedInvalid.success) {
      const publishedInvalid = capability.publishTranslation(mergedInvalid.translation);
      assert.ok(!publishedInvalid.success);
      if (!publishedInvalid.success) {
        assert.ok(publishedInvalid.error.includes("failed preservation validation"));
      }
    }
  }

  const validContent = "Hello {{username}}, welcome to [link](url) and <a href=\"url\"> and [[wiki.link]] and {{date}} and {{count}}";
  const validTranslation = capability.proposeTranslation(
    "translation-6",
    validContent
  );
  const preservation = capability.validatePreservation(validTranslation);
  assert.ok(preservation.valid);
  assert.equal(preservation.missingTokens.length, 0);
  assert.equal(preservation.alteredTokens.length, 0);

  const submittedValid = capability.submitForReview(validTranslation);
  assert.ok(submittedValid.success);
  if (submittedValid.success) {
    const approvedValid = {
      ...submittedValid.translation,
      reviewStatus: "approved" as const,
    };
    const mergedValid = capability.approveForMerge(approvedValid);
    assert.ok(mergedValid.success);
    if (mergedValid.success) {
      const publishedValid = capability.publishTranslation(mergedValid.translation);
      assert.ok(publishedValid.success);
      if (publishedValid.success) {
        assert.equal(publishedValid.translation.state, "publication");
      }
    }
  }
});