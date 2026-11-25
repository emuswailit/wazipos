// app/(church)/churches/index.tsx — Church → My church (everyone signed in; ?church=<id> opens any church).

import ChurchHome from '@/components/church/ChurchHome';

export default function ChurchesRoute() {
    return <ChurchHome />;
}
