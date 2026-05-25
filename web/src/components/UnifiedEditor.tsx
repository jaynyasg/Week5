import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Editor } from '@/components/Editor';
import { PropertiesPanel } from '@/components/sidebars/PropertiesPanel';
import { WeeklyReviewSubNav } from '@/components/review/WeeklyReviewSubNav';
import { useWeeklyReviewActions } from '@/hooks/useWeeklyReviewActions';
import type {
  PanelDocument,
  WikiPanelProps,
  IssuePanelProps,
  ProjectPanelProps,
  SprintPanelProps,
  ProgramPanelProps,
} from '@/components/sidebars/PropertiesPanel';
import { DocumentTypeSelector, getMissingRequiredFields } from '@/components/sidebars/DocumentTypeSelector';
import type { DocumentType } from '@/components/sidebars/DocumentTypeSelector';
import { useAuth } from '@/hooks/useAuth';
import { PlanQualityBanner, RetroQualityBanner } from '@/components/PlanQualityBanner';
import { useAutoSave } from '@/hooks/useAutoSave';
import type { Person } from '@/components/PersonCombobox';
import type { BelongsTo } from '@ship/shared';

export type UnifiedDocumentType = DocumentType | 'program' | 'person' | 'weekly_plan' | 'weekly_retro';

// Base document interface - common properties across all document types
interface BaseDocument {
  id: string;
  title: string;
  document_type: UnifiedDocumentType;
  created_at?: string;
  updated_at?: string;
  created_by?: string | null;
  properties?: Record<string, unknown>;
}

// Wiki document
interface WikiDocument extends BaseDocument {
  document_type: 'wiki';
  parent_id?: string | null;
  visibility?: 'private' | 'workspace';
}

// Issue document
interface IssueDocument extends BaseDocument {
  document_type: 'issue';
  state: string;
  priority: string;
  estimate: number | null;
  assignee_id: string | null;
  assignee_name?: string | null;
  assignee_archived?: boolean;
  program_id: string | null;
  sprint_id: string | null;
  source?: 'internal' | 'external';
  rejection_reason?: string | null;
  converted_from_id?: string | null;
  display_id?: string;
  belongs_to?: BelongsTo[];
}

// Project document
interface ProjectDocument extends BaseDocument {
  document_type: 'project';
  impact: number | null;
  confidence: number | null;
  ease: number | null;
  ice_score?: number | null;
  color: string;
  emoji: string | null;
  program_id: string | null;
  owner?: { id: string; name: string; email: string } | null;
  owner_id?: string | null;
  // RACI fields
  accountable_id?: string | null;
  consulted_ids?: string[];
  informed_ids?: string[];
  sprint_count?: number;
  issue_count?: number;
  converted_from_id?: string | null;
  plan?: string | null;
}

// Sprint document
interface SprintDocument extends BaseDocument {
  document_type: 'sprint';
  start_date?: string;
  end_date?: string;
  status: 'planning' | 'active' | 'completed';
  program_id: string | null;
  program_name?: string;
  issue_count?: number;
  completed_count?: number;
  plan?: string;
}

interface ProgramDocument extends BaseDocument {
  document_type: 'program';
  color?: string;
  emoji?: string | null;
  owner_id?: string | null;
  accountable_id?: string | null;
  consulted_ids?: string[];
  informed_ids?: string[];
}

interface PersonDocument extends BaseDocument {
  document_type: 'person';
}

interface WeeklyReviewDocument extends BaseDocument {
  document_type: 'weekly_plan' | 'weekly_retro';
  properties?: {
    person_id?: string;
    project_id?: string;
    week_number?: number;
    submitted_at?: string | null;
  };
}

// Union type for all document types
export type UnifiedDocument =
  | WikiDocument
  | IssueDocument
  | ProjectDocument
  | SprintDocument
  | ProgramDocument
  | PersonDocument
  | WeeklyReviewDocument;

export interface SidebarData {
  teamMembers?: SidebarPerson[];
  programs?: Array<{ id: string; name: string; color?: string; emoji?: string | null }>;
  projects?: Array<{ id: string; title: string; color?: string }>;
  people?: SidebarPerson[];
  existingSprints?: Array<{ owner?: { id: string; name: string; email: string } | null }>;
  onConvert?: () => void;
  onUndoConversion?: () => void;
  onAccept?: () => Promise<void>;
  onReject?: (reason: string) => Promise<void>;
  isConverting?: boolean;
  isUndoing?: boolean;
  onAssociationChange?: () => void;
}

interface SidebarPerson {
  id: string;
  user_id: string;
  name: string;
  email?: string;
}

function isSelectableDocumentType(type: UnifiedDocumentType): type is DocumentType {
  return type === 'wiki' || type === 'issue' || type === 'project' || type === 'sprint';
}

function isPanelDocument(document: UnifiedDocument): document is PanelDocument {
  return document.document_type !== 'person';
}

function withEmail(people: SidebarPerson[] | undefined): Person[] {
  return (people || []).map((person) => ({
    ...person,
    email: person.email || '',
  }));
}

interface UnifiedEditorProps {
  /** The document to edit */
  document: UnifiedDocument;
  /** Type-specific sidebar data */
  sidebarData?: SidebarData;
  /** Handler for document updates */
  onUpdate: (updates: Partial<UnifiedDocument>) => Promise<void>;
  /** Handler for back navigation */
  onBack?: () => void;
  /** Label for back button */
  backLabel?: string;
  /** Handler for document deletion */
  onDelete?: () => void;
  /** Room prefix for collaboration */
  roomPrefix?: string;
  /** Placeholder text for empty editor */
  placeholder?: string;
  /** Handler for creating sub-documents */
  onCreateSubDocument?: () => Promise<{ id: string; title: string } | null>;
  /** Handler for navigating to documents */
  onNavigateToDocument?: (docId: string) => void;
  /** Handler for document conversion events */
  onDocumentConverted?: (newDocId: string, newDocType: 'issue' | 'project') => void;
  /** Badge to show in header */
  headerBadge?: React.ReactNode;
  /** Whether to show the document type selector */
  showTypeSelector?: boolean;
  /** Handler for document type changes (if different from onUpdate) */
  onTypeChange?: (newType: UnifiedDocumentType) => Promise<void>;
  /** Suffix displayed after the title in the header (e.g., author name) */
  titleSuffix?: string;
}

type DocumentScopedValue<T> = {
  documentId: string;
  value: T;
};

/**
 * UnifiedEditor - Adaptive editor component that renders type-specific properties
 *
 * This component provides a unified editing experience for all document types
 * by adapting the properties sidebar based on document_type while using the
 * same TipTap editor for content.
 *
 * Usage:
 * ```tsx
 * <UnifiedEditor
 *   document={myDocument}
 *   sidebarData={typeSpecificData}
 *   onUpdate={handleUpdate}
 *   onBack={() => navigate(-1)}
 * />
 * ```
 */
export function UnifiedEditor({
  document,
  sidebarData = {},
  onUpdate,
  onBack,
  backLabel,
  onDelete,
  roomPrefix,
  placeholder,
  onCreateSubDocument,
  onNavigateToDocument,
  onDocumentConverted,
  headerBadge,
  showTypeSelector = false,
  onTypeChange,
  titleSuffix,
}: UnifiedEditorProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [isChangingType, setIsChangingType] = useState(false);

  // Track missing required fields after type changes
  const missingFields = useMemo(() => {
    if (isSelectableDocumentType(document.document_type)) {
      // Build properties object from document
      const props: Record<string, unknown> = {
        ...document.properties,
        // Include top-level fields that might be required
      };

      switch (document.document_type) {
        case 'issue':
          props.state = document.state;
          props.priority = document.priority;
          break;
        case 'project':
          props.impact = document.impact;
          props.confidence = document.confidence;
          props.ease = document.ease;
          break;
        case 'sprint':
          props.start_date = document.start_date;
          props.end_date = document.end_date;
          props.status = document.status;
          break;
      }

      return getMissingRequiredFields(document.document_type, props);
    }
    return [];
  }, [document]);

  // Auto-save title changes
  const throttledTitleSave = useAutoSave({
    onSave: async (title: string) => {
      if (title) await onUpdate({ title });
    },
  });

  // Handle document type change
  const handleTypeChange = useCallback(async (newType: DocumentType) => {
    if (newType === document.document_type) return;

    setIsChangingType(true);
    try {
      if (onTypeChange) {
        await onTypeChange(newType);
      } else {
        await onUpdate({ document_type: newType });
      }
    } finally {
      setIsChangingType(false);
    }
  }, [document.document_type, onTypeChange, onUpdate]);

  // Navigate to document handler
  const handleNavigateToDocument = useCallback((docId: string) => {
    if (onNavigateToDocument) {
      onNavigateToDocument(docId);
    } else {
      navigate(`/documents/${docId}`);
    }
  }, [navigate, onNavigateToDocument]);

  // Handle plan change (for sprint and project documents)
  const handlePlanChange = useCallback(async (plan: string) => {
    if (document.document_type !== 'sprint' && document.document_type !== 'project') return;
    // Update the plan property
    const updates: Partial<ProjectDocument | SprintDocument> = { plan };
    await onUpdate(updates);
  }, [document.document_type, onUpdate]);

  const handlePanelUpdate = useCallback((updates: Partial<PanelDocument>) => {
    return onUpdate(updates);
  }, [onUpdate]);

  // Determine room prefix based on document type if not provided
  const effectiveRoomPrefix = roomPrefix || document.document_type;

  // Determine placeholder based on document type if not provided
  const effectivePlaceholder = placeholder || getDefaultPlaceholder(document.document_type);

  // Weekly plans and retros have review-mode sub-nav controls
  const isWeeklyDoc = document.document_type === 'weekly_plan' || document.document_type === 'weekly_retro';

  const weeklyReviewState = useWeeklyReviewActions(
    isWeeklyDoc
      ? {
          id: document.id,
          document_type: document.document_type,
          properties: document.properties,
        }
      : null
  );

  // Check if this document type can have its type changed
  const selectableDocumentType = isSelectableDocumentType(document.document_type)
    ? document.document_type
    : null;

  // Build panel-specific props from sidebarData
  const panelProps = useMemo(() => {
    switch (document.document_type) {
      case 'wiki': {
        return {
          teamMembers: withEmail(sidebarData.teamMembers),
          currentUserId: user?.id,
        } satisfies WikiPanelProps;
      }
      case 'issue': {
        return {
          teamMembers: sidebarData.teamMembers || [],
          programs: sidebarData.programs || [],
          projects: sidebarData.projects || [],
          onConvert: sidebarData.onConvert,
          onUndoConversion: sidebarData.onUndoConversion,
          onAccept: sidebarData.onAccept,
          onReject: sidebarData.onReject,
          isConverting: sidebarData.isConverting,
          isUndoing: sidebarData.isUndoing,
          onAssociationChange: sidebarData.onAssociationChange,
        } satisfies IssuePanelProps;
      }
      case 'project': {
        return {
          programs: (sidebarData.programs || []).map((program) => ({
            ...program,
            color: program.color || '#6366f1',
          })),
          people: withEmail(sidebarData.people),
          onConvert: sidebarData.onConvert,
          onUndoConversion: sidebarData.onUndoConversion,
          isConverting: sidebarData.isConverting,
          isUndoing: sidebarData.isUndoing,
        } satisfies ProjectPanelProps;
      }
      case 'sprint': {
        return {
          people: sidebarData.people || [],
          existingSprints: sidebarData.existingSprints || [],
        } satisfies SprintPanelProps;
      }
      case 'program': {
        return {
          people: withEmail(sidebarData.people),
        } satisfies ProgramPanelProps;
      }
      default:
        return {};
    }
  }, [document.document_type, sidebarData, user?.id]);

  // Render the type-specific sidebar content via unified PropertiesPanel
  const typeSpecificSidebar = useMemo(() => {
    // Check if document type has a properties panel
    if (!isPanelDocument(document)) {
      return (
        <div className="p-4">
          <p className="text-xs text-muted">
            Document type: {document.document_type}
          </p>
        </div>
      );
    }

    return (
      <PropertiesPanel
        document={document}
        panelProps={panelProps}
        onUpdate={handlePanelUpdate}
        highlightedFields={missingFields}
        weeklyReviewState={weeklyReviewState}
      />
    );
  }, [document, panelProps, handlePanelUpdate, missingFields, weeklyReviewState]);

  // Compose full sidebar with type selector
  const sidebar = useMemo(() => {
    // If we're not showing the type selector, just return the type-specific sidebar
    if (!showTypeSelector || !selectableDocumentType) {
      return typeSpecificSidebar;
    }

    // Add type selector at the top
    return (
      <div className="flex flex-col h-full">
        {/* Type Selector */}
        <div className="p-4 border-b border-border">
          <DocumentTypeSelector
            value={selectableDocumentType}
            onChange={handleTypeChange}
            disabled={isChangingType}
          />
          {missingFields.length > 0 && (
            <p className="mt-2 text-xs text-amber-500">
              Please fill in required fields: {missingFields.join(', ')}
            </p>
          )}
        </div>
        {/* Type-specific sidebar */}
        <div className="flex-1 overflow-auto pb-20">
          {typeSpecificSidebar}
        </div>
      </div>
    );
  }, [showTypeSelector, typeSpecificSidebar, selectableDocumentType, handleTypeChange, isChangingType, missingFields]);

  // Weekly plans and retros have computed titles (includes person name) - make read-only
  const isTitleReadOnly = document.document_type === 'weekly_plan' || document.document_type === 'weekly_retro';

  // AI quality banner — triggers analysis on content changes from the editor
  const [editorContentState, setEditorContentState] = useState<DocumentScopedValue<Record<string, unknown> | null>>(() => ({
    documentId: document.id,
    value: null,
  }));
  const [aiScoringAnalysisState, setAiScoringAnalysisState] = useState<DocumentScopedValue<{ planAnalysis?: unknown; retroAnalysis?: unknown } | null>>(() => ({
    documentId: document.id,
    value: null,
  }));
  const editorContent = editorContentState.documentId === document.id ? editorContentState.value : null;
  const aiScoringAnalysis = aiScoringAnalysisState.documentId === document.id ? aiScoringAnalysisState.value : null;

  const setEditorContent = useCallback((content: Record<string, unknown>) => {
    setEditorContentState({ documentId: document.id, value: content });
  }, [document.id]);

  const handlePlanAnalysisChange = useCallback((analysis: unknown) => {
    setAiScoringAnalysisState({
      documentId: document.id,
      value: analysis ? { planAnalysis: analysis } : null,
    });
  }, [document.id]);

  const handleRetroAnalysisChange = useCallback((analysis: unknown) => {
    setAiScoringAnalysisState({
      documentId: document.id,
      value: analysis ? { retroAnalysis: analysis } : null,
    });
  }, [document.id]);

  const qualityBanner = useMemo(() => {
    if (document.document_type === 'weekly_plan') {
      return <PlanQualityBanner documentId={document.id} editorContent={editorContent} onAnalysisChange={handlePlanAnalysisChange} />;
    }
    if (document.document_type === 'weekly_retro') {
      return <RetroQualityBanner documentId={document.id} editorContent={editorContent} planContent={null} onAnalysisChange={handleRetroAnalysisChange} />;
    }
    return undefined;
  }, [document.id, document.document_type, editorContent, handlePlanAnalysisChange, handleRetroAnalysisChange]);

  const secondaryHeader = useMemo(() => {
    if (!weeklyReviewState?.isReviewMode) return undefined;
    return <WeeklyReviewSubNav reviewState={weeklyReviewState} />;
  }, [weeklyReviewState]);

  if (!user) {
    return null;
  }

  return (
    <Editor
      documentId={document.id}
      userName={user.name}
      initialTitle={document.title}
      onTitleChange={isTitleReadOnly ? undefined : throttledTitleSave}
      titleReadOnly={isTitleReadOnly}
      onBack={onBack}
      backLabel={backLabel}
      onDelete={onDelete}
      roomPrefix={effectiveRoomPrefix}
      placeholder={effectivePlaceholder}
      onCreateSubDocument={onCreateSubDocument}
      onNavigateToDocument={handleNavigateToDocument}
      onDocumentConverted={onDocumentConverted}
      headerBadge={headerBadge}
      secondaryHeader={secondaryHeader}
      sidebar={sidebar}
      documentType={document.document_type}
      onPlanChange={document.document_type === 'sprint' || document.document_type === 'project' ? handlePlanChange : undefined}
      contentBanner={qualityBanner}
      onContentChange={isWeeklyDoc ? setEditorContent : undefined}
      aiScoringAnalysis={isWeeklyDoc ? aiScoringAnalysis : undefined}
      titleSuffix={titleSuffix}
    />
  );
}

/**
 * Get default placeholder text based on document type
 */
function getDefaultPlaceholder(documentType: UnifiedDocumentType): string {
  switch (documentType) {
    case 'wiki':
      return 'Start writing...';
    case 'issue':
      return 'Add a description...';
    case 'project':
      return 'Describe this project...';
    case 'sprint':
      return 'Add week goals, notes, or description...';
    case 'program':
      return 'Describe this program...';
    case 'person':
      return 'Add notes about this person...';
    default:
      return 'Start writing...';
  }
}

// Re-export PropertiesPanel as the unified entry point for sidebars
export { PropertiesPanel } from '@/components/sidebars/PropertiesPanel';
export type {
  PanelDocument,
  PanelDocumentType,
  WikiPanelProps,
  IssuePanelProps,
  ProjectPanelProps,
  SprintPanelProps,
} from '@/components/sidebars/PropertiesPanel';
