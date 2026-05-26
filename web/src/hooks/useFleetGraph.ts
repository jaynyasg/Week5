import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import type {
  AssistantRouteContext,
  FleetGraphActionDecisionRequest,
  FleetGraphChatRequest,
  FleetGraphChatResponse,
  FleetGraphFindingSummary,
} from '@ship/shared';
import {
  decideFleetGraphAction,
  getFleetGraphFinding,
  getFleetGraphFindings,
  getFleetGraphRun,
  getFleetGraphStatus,
  sendFleetGraphMessage,
  updateFleetGraphDelivery,
} from '@/services/fleetgraph';

export const fleetGraphKeys = {
  status: ['fleetgraph', 'status'] as const,
  findingsRoot: ['fleetgraph', 'findings'] as const,
  findings: (context?: AssistantRouteContext) => [
    ...fleetGraphKeys.findingsRoot,
    context?.documentId ?? null,
    context?.projectId ?? null,
  ] as const,
  finding: (id?: string | null) => ['fleetgraph', 'finding', id] as const,
  run: (id?: string | null) => ['fleetgraph', 'run', id] as const,
};

export interface FleetGraphTranscriptMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
  response?: FleetGraphChatResponse;
}

export function useFleetGraph(context?: AssistantRouteContext) {
  const queryClient = useQueryClient();
  const [messages, setMessages] = useState<FleetGraphTranscriptMessage[]>([]);
  const [selectedFindingId, setSelectedFindingId] = useState<string | null>(null);

  const statusQuery = useQuery({
    queryKey: fleetGraphKeys.status,
    queryFn: getFleetGraphStatus,
    staleTime: 60_000,
  });

  const findingsQuery = useQuery({
    queryKey: fleetGraphKeys.findings(context),
    queryFn: () => getFleetGraphFindings(context),
    staleTime: 30_000,
  });

  const selectedFindingQuery = useQuery({
    queryKey: fleetGraphKeys.finding(selectedFindingId),
    queryFn: () => getFleetGraphFinding(selectedFindingId!),
    enabled: Boolean(selectedFindingId),
  });

  const selectedRunId = selectedFindingQuery.data?.runId;
  const runQuery = useQuery({
    queryKey: fleetGraphKeys.run(selectedRunId),
    queryFn: () => getFleetGraphRun(selectedRunId!),
    enabled: Boolean(selectedRunId),
  });

  const deliveryByFindingId = useMemo(() => {
    return new Map(
      (findingsQuery.data?.deliveries ?? []).map((delivery) => [delivery.findingDocumentId, delivery]),
    );
  }, [findingsQuery.data?.deliveries]);

  const unreadCount = useMemo(() => {
    return (findingsQuery.data?.deliveries ?? []).filter((delivery) => delivery.status === 'unread').length;
  }, [findingsQuery.data?.deliveries]);

  const chatMutation = useMutation({
    mutationFn: sendFleetGraphMessage,
    onSuccess: (response) => {
      setMessages((current) => [
        ...current,
        {
          id: response.message.id,
          role: 'assistant',
          content: response.message.content,
          createdAt: response.message.createdAt,
          response,
        },
      ]);
      void queryClient.invalidateQueries({ queryKey: fleetGraphKeys.findingsRoot });
    },
  });

  const deliveryMutation = useMutation({
    mutationFn: ({ id, status, snoozedUntil }: { id: string; status: 'read' | 'dismissed' | 'snoozed'; snoozedUntil?: string }) =>
      updateFleetGraphDelivery(id, status, snoozedUntil),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: fleetGraphKeys.findingsRoot });
    },
  });

  const decisionMutation = useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: FleetGraphActionDecisionRequest }) =>
      decideFleetGraphAction(id, decision),
    onSuccess: (_proposal, variables) => {
      void queryClient.invalidateQueries({ queryKey: fleetGraphKeys.findingsRoot });
      void queryClient.invalidateQueries({ queryKey: fleetGraphKeys.finding(selectedFindingId) });
      void queryClient.invalidateQueries({ queryKey: fleetGraphKeys.run(selectedRunId) });
      setMessages((current) => [
        ...current,
        {
          id: `decision-${variables.id}-${Date.now()}`,
          role: 'assistant',
          content: `Action proposal ${variables.decision.status}.`,
          createdAt: new Date().toISOString(),
        },
      ]);
    },
  });

  const selectFinding = (finding: FleetGraphFindingSummary) => {
    setSelectedFindingId(finding.id);
    const delivery = deliveryByFindingId.get(finding.id);
    if (delivery?.status === 'unread') {
      deliveryMutation.mutate({ id: delivery.id, status: 'read' });
    }
  };

  const updateSelectedDelivery = (status: 'read' | 'dismissed' | 'snoozed', snoozedUntil?: string) => {
    if (!selectedFindingId) return;
    const delivery = deliveryByFindingId.get(selectedFindingId);
    if (!delivery) return;
    deliveryMutation.mutate({ id: delivery.id, status, snoozedUntil });
  };

  const send = (message: string, findingId?: string) => {
    const trimmed = message.trim();
    if (!trimmed || chatMutation.isPending) return;

    const userMessage: FleetGraphTranscriptMessage = {
      id: `client-${Date.now()}`,
      role: 'user',
      content: trimmed,
      createdAt: new Date().toISOString(),
    };

    const history: FleetGraphChatRequest['history'] = messages
      .slice(-6)
      .map((item) => ({
        role: item.role,
        content: item.content,
      }));

    setMessages((current) => [...current, userMessage]);
    chatMutation.mutate({
      message: trimmed,
      history,
      context,
      findingId,
    });
  };

  return {
    status: statusQuery.data,
    statusLoading: statusQuery.isLoading,
    statusError: statusQuery.error,
    findings: findingsQuery.data?.findings ?? [],
    deliveries: findingsQuery.data?.deliveries ?? [],
    deliveryByFindingId,
    findingsLoading: findingsQuery.isLoading,
    findingsError: findingsQuery.error,
    unreadCount,
    selectedFindingId,
    selectedFinding: selectedFindingQuery.data,
    selectedFindingLoading: selectedFindingQuery.isLoading,
    selectedRun: runQuery.data,
    selectedRunLoading: runQuery.isLoading,
    messages,
    send,
    sending: chatMutation.isPending,
    sendError: chatMutation.error,
    selectFinding,
    clearSelectedFinding: () => setSelectedFindingId(null),
    updateSelectedDelivery,
    updatingDelivery: deliveryMutation.isPending,
    decideAction: (id: string, decision: FleetGraphActionDecisionRequest) =>
      decisionMutation.mutate({ id, decision }),
    decidingAction: decisionMutation.isPending,
    decisionError: decisionMutation.error,
    refresh: () => {
      void queryClient.invalidateQueries({ queryKey: fleetGraphKeys.findingsRoot });
    },
    reset: () => setMessages([]),
  };
}
