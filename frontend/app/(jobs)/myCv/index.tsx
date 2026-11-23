// app/(jobs)/myCv/index.tsx — Jobs → My CV: build with the AI assistant, save, print, share as PDF.
// ?cv=<id> opens one; ?advert=<id>&title=<job> offers to tailor it to that job.

import CvBuilder from '@/components/jobs/cv/CvBuilder';

export default function MyCvRoute() {
    return <CvBuilder />;
}
