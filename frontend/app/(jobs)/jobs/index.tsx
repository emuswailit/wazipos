// app/(jobs)/jobs/index.tsx — the jobs board (every signed-in user). ?code=<share code> opens a job.

import JobsBoard from '@/components/jobs/JobsBoard';

export default function JobsRoute() {
    return <JobsBoard />;
}
