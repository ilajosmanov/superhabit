import { ProfileScreen } from '@/account/components/profile-screen';
import { useLeave } from '@/bootstrap/leave';
import { useLibrary } from '@/challenges/library-live';

/** Profile: your account, from the shared snapshot; leaving it goes to startup. */
export default function MeRoute() {
  const { account, sharing } = useLibrary();
  return <ProfileScreen account={account} sharing={sharing} leave={useLeave()} />;
}
