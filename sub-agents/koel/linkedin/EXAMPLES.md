# LinkedIn — patterns that work

These are **shape references**, not text to copy. Learn the structure, the pacing, and where the
specificity sits. Never reuse the wording, and never reuse the subject matter.

Read each one against the "see more" fold: notice that the first two lines always contain the actual
claim, never a warm-up.

---

## Pattern 1 — The observation

> Most engineering teams don't have a testing problem. They have a "nobody owns the flaky test"
> problem.
>
> A flaky test fails once a week. Nobody wants to spend an afternoon on it, so it gets re-run.
> Six months later there are forty of them, the suite takes an hour, and people have quietly
> stopped trusting it entirely.
>
> The cost never shows up as a line item. It shows up as engineers shipping on Friday because
> they've learned the red build doesn't mean anything.
>
> The fix isn't better tooling. It's making one person accountable for the suite being green,
> the same way one person is accountable for the build.
>
> The teams that do this ship faster and it isn't close.

**Why it works:** names something people recognise but haven't put words to · concrete numbers
(a week, forty, an hour) · the payoff is a real, applicable change · ends on a claim worth arguing with.

---

## Pattern 2 — The counter-take

> "Move fast and break things" was never advice for teams of four.
>
> It was advice for a company that could afford to break things, absorb the fallout, and hire
> through it. Most of us are borrowing risk tolerance from a balance sheet we don't have.
>
> When you're small, a broken thing isn't a learning opportunity. It's your only customer
> churning, and there's no second one queued behind them yet.
>
> The version that actually applies: move fast on things that are cheap to undo, and slowly on
> things that aren't. Deploy twice a day. Change your data model once a quarter.
>
> Speed isn't a value. It's a property of a specific decision.

**Why it works:** takes a phrase everyone repeats and shows the missing context · no strawman, the
original is treated fairly · lands on a usable rule, not just a rebuttal.

---

## Pattern 3 — The breakdown

> After the third time I rebuilt the same scheduling logic, I started writing down what actually
> makes it hard. Four things, every time:
>
> Timezones aren't offsets. They're political decisions that change, sometimes with weeks of
> notice. Store the zone, never the offset.
>
> "Daily at 9am" is ambiguous twice a year. Decide explicitly whether a DST shift means the job
> skips, doubles, or drifts — and write the decision in a comment, because the next person will
> assume the opposite.
>
> Catch-up is a product decision, not a technical one. If the server was down for six hours, does
> the user want six notifications or one? Ask before you build.
>
> Idempotency is not optional. Anything that can fire twice will fire twice.
>
> None of this is hard individually. It's hard because it's four separate decisions that all look
> like implementation details until one of them wakes you up.

**Why it works:** earns the "see more" with a specific number ("four things") · each point is
independently useful · the closing line reframes rather than summarising.

---

## Pattern 4 — The lesson from a real decision

> We spent six weeks building a feature that three customers had asked for. It shipped. Those
> three customers used it. Nobody else ever did.
>
> The mistake wasn't listening to customers. It was not asking the second question: is this the
> thing you'd switch products over, or the thing you'd mention if someone asked?
>
> Those are wildly different signals and they sound identical in a call.
>
> Now every request gets that follow-up. About half turn out to be the second kind — real, worth
> knowing, and not worth six weeks.
>
> Roadmaps don't fail because teams ignore customers. They fail because every request arrives
> sounding equally urgent.

**Why it works:** the cost is stated plainly (six weeks, three customers) · the lesson is a question
you could actually start asking tomorrow · framed as the idea, not the war story.

---

## What none of these do

No hashtag stuffing mid-post. No one-line-per-paragraph broetry. No "Agree?" No emoji bullets. No
link in the body. No opener that spends its first line clearing its throat.
