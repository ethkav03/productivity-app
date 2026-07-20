'use client';

import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link2, Trash2, UserCheck } from 'lucide-react';
import { getApiErrorMessage } from '@/lib/api-client';
import { acceptAdminFriendship, createAdminFriendship, deleteAdminFriendship, getAdminFriendships } from '@/lib/api/admin';
import { FriendshipStatus } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, Label, Select } from '@/components/ui/input';
import { PageSpinner } from '@/components/ui/spinner';
import { useToast } from '@/components/ui/toaster';

export function FriendshipsPanel() {
  const queryClient = useQueryClient();
  const { push } = useToast();
  const [requesterUsername, setRequesterUsername] = useState('');
  const [addresseeUsername, setAddresseeUsername] = useState('');
  const [status, setStatus] = useState<FriendshipStatus>('ACCEPTED');

  const friendshipsQuery = useQuery({ queryKey: ['admin', 'friendships'], queryFn: getAdminFriendships });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['admin', 'friendships'] });
  }

  const createMutation = useMutation({
    mutationFn: createAdminFriendship,
    onSuccess: () => {
      setRequesterUsername('');
      setAddresseeUsername('');
      invalidate();
    },
    onError: (error) => push({ title: 'Could not create friendship', description: getApiErrorMessage(error) }),
  });

  const acceptMutation = useMutation({
    mutationFn: acceptAdminFriendship,
    onSuccess: invalidate,
    onError: (error) => push({ title: 'Could not accept friendship', description: getApiErrorMessage(error) }),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteAdminFriendship,
    onSuccess: invalidate,
    onError: (error) => push({ title: 'Could not remove friendship', description: getApiErrorMessage(error) }),
  });

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!requesterUsername.trim() || !addresseeUsername.trim()) return;
    createMutation.mutate({
      requesterUsername: requesterUsername.trim(),
      addresseeUsername: addresseeUsername.trim(),
      status,
    });
  }

  const friendships = friendshipsQuery.data ?? [];

  return (
    <div className="space-y-4">
      <Card>
        <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
          <div>
            <Label htmlFor="fs-requester">Requester username</Label>
            <Input
              id="fs-requester"
              value={requesterUsername}
              onChange={(event) => setRequesterUsername(event.target.value)}
              className="w-48"
            />
          </div>
          <div>
            <Label htmlFor="fs-addressee">Addressee username</Label>
            <Input
              id="fs-addressee"
              value={addresseeUsername}
              onChange={(event) => setAddresseeUsername(event.target.value)}
              className="w-48"
            />
          </div>
          <div>
            <Label htmlFor="fs-status">Status</Label>
            <Select id="fs-status" value={status} onChange={(event) => setStatus(event.target.value as FriendshipStatus)} className="w-36">
              <option value="ACCEPTED">Accepted</option>
              <option value="PENDING">Pending</option>
            </Select>
          </div>
          <Button type="submit" loading={createMutation.isPending}>
            <Link2 className="h-4 w-4" />
            Create
          </Button>
        </form>
      </Card>

      {friendshipsQuery.isLoading ? (
        <PageSpinner />
      ) : friendships.length === 0 ? (
        <p className="text-sm text-muted">No friendships in the system yet.</p>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs uppercase tracking-wide text-muted">
                <th className="px-4 py-2.5 font-medium">Requester</th>
                <th className="px-4 py-2.5 font-medium">Addressee</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium">Created</th>
                <th className="px-4 py-2.5 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {friendships.map((friendship) => (
                <tr key={friendship.id}>
                  <td className="px-4 py-2.5 text-foreground">{friendship.requester.username}</td>
                  <td className="px-4 py-2.5 text-foreground">{friendship.addressee.username}</td>
                  <td className="px-4 py-2.5">
                    <Badge variant={friendship.status === 'ACCEPTED' ? 'success' : 'outline'}>{friendship.status}</Badge>
                  </td>
                  <td className="px-4 py-2.5 text-muted">{new Date(friendship.createdAt).toLocaleDateString()}</td>
                  <td className="px-4 py-2.5 text-right">
                    <div className="flex justify-end gap-1.5">
                      {friendship.status === 'PENDING' && (
                        <Button
                          size="sm"
                          variant="outline"
                          loading={acceptMutation.isPending && acceptMutation.variables === friendship.id}
                          onClick={() => acceptMutation.mutate(friendship.id)}
                        >
                          <UserCheck className="h-3.5 w-3.5" />
                          Accept
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-danger hover:bg-danger/10"
                        loading={deleteMutation.isPending && deleteMutation.variables === friendship.id}
                        onClick={() => {
                          if (window.confirm('Remove this friendship?')) deleteMutation.mutate(friendship.id);
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
