import { Card } from "../components/ui";

export function JobsPage() {
  return (
    <Card className="p-8 text-center">
      <h1 className="text-lg font-semibold">Job matching</h1>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted">
        Paste a job description, pick a master profile, get a score and reviewable suggestions. Coming in the next milestone.
      </p>
    </Card>
  );
}
