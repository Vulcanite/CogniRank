import InterviewDashboard from "@/components/interview-dashboard";

type PageProps = {
  params: Promise<{ sessionId: string }>;
};

export default async function InterviewPage({ params }: PageProps) {
  const { sessionId } = await params;
  return <InterviewDashboard sessionId={sessionId} />;
}
