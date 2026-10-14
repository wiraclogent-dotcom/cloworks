import type { ReactNode } from "react";
import { LayoutGrid, Plus } from "lucide-react";
import type { ContentPlanView } from "@/lib/content/view";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/components/ui/cn";
import { AddChannelButton, type BrandOption } from "./ChannelForm";
import { ChannelList } from "./ChannelList";
import { PhonePreview } from "./PhonePreview";

/**
 * The Content Plan body (approved layout B): channel list on the left, phone preview in the middle, and the post
 * side panel on the right when `panel` is given (for `view.postId`).
 */
export function ContentPlanLayout({ view, brands, panel }: { view: ContentPlanView; brands: BrandOption[]; panel?: ReactNode }) {
  const { channel, can, tab, postId } = view;
  if (!channel) {
    return can.manageChannels ? (
      <EmptyState icon={<LayoutGrid />} title="Add your first channel"
        description="Add a brand's Instagram account to start planning its feed, reels and stories."
        action={<AddChannelButton brands={brands} variant="default" icon={<Plus />}>Add channel</AddChannelButton>} />
    ) : (
      <EmptyState icon={<LayoutGrid />} title="No channels yet" description="A lead adds each brand's Instagram account here before posts can be planned." />
    );
  }
  return (
    <div className={cn("grid gap-5 lg:grid-cols-[13.5rem_minmax(0,1fr)]", !!panel && "xl:grid-cols-[13.5rem_minmax(0,1fr)_minmax(0,26rem)]")}>
      <ChannelList channels={view.channels} currentId={channel.id} tab={tab} canManage={can.manageChannels} brands={brands} />
      <div className="min-w-0 rounded-xl bg-muted px-3 py-6 sm:px-6">
        <PhonePreview channel={channel} tab={tab} planned={view.planned} published={view.published} canDraft={can.draft} selectedId={postId} />
      </div>
      {/* Below xl the panel is a full-screen sheet (PostPanel), so it never stacks under the phone. */}
      {panel ? <div className="min-w-0">{panel}</div> : null}
    </div>
  );
}
