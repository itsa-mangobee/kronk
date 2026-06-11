import { apiRequestPost, apiRequestGet } from 'mastodon/api';
import type {
  ApiAccountJSON,
  ApiFamiliarFollowersJSON,
} from 'mastodon/api_types/accounts';
import type { ApiRelationshipJSON } from 'mastodon/api_types/relationships';
import type { ApiHashtagJSON } from 'mastodon/api_types/tags';

export const apiSubmitAccountNote = (id: string, value: string) =>
  apiRequestPost<ApiRelationshipJSON>(`v1/accounts/${id}/note`, {
    comment: value,
  });

export const apiFollowAccount = (
  id: string,
  params?: {
    reblogs: boolean;
  },
) =>
  apiRequestPost<ApiRelationshipJSON>(`v1/accounts/${id}/follow`, {
    ...params,
  });

export const apiUnfollowAccount = (id: string) =>
  apiRequestPost<ApiRelationshipJSON>(`v1/accounts/${id}/unfollow`);

export const apiRemoveAccountFromFollowers = (id: string) =>
  apiRequestPost<ApiRelationshipJSON>(
    `v1/accounts/${id}/remove_from_followers`,
  );

export const apiGetFeaturedTags = (id: string) =>
  apiRequestGet<ApiHashtagJSON>(`v1/accounts/${id}/featured_tags`);

export const apiGetEndorsedAccounts = (id: string) =>
  apiRequestGet<ApiAccountJSON>(`v1/accounts/${id}/endorsements`);

export const apiGetFamiliarFollowers = (id: string) =>
  apiRequestGet<ApiFamiliarFollowersJSON>('v1/accounts/familiar_followers', {
    id,
  });

export const apiNudgeAccount = (
  id: string,
  params?: {
    text?: string;
    media_id?: string;
    in_reply_to_notification_id?: string;
  },
) =>
  apiRequestPost<{ streak: number; can_nudge: boolean }>(
    `v1/accounts/${id}/nudge`,
    params ?? {},
  );

export const apiGetNudgeStreak = (id: string) =>
  apiRequestGet<{
    streak: number;
    can_nudge: boolean;
    sent_count: number;
    received_count: number;
  }>(`v1/accounts/${id}/nudge_streak`);

export interface ApiNudgeLastMessage {
  type: 'plain' | 'text' | 'image' | 'video' | 'voice';
  body: string | null;
  direction: 'sent' | 'received' | null;
  created_at: string | null;
}

export interface ApiNudgePartner {
  account_id: string;
  sent_count: number;
  received_count: number;
  streak: number;
  last_nudge_at: string | null;
  can_nudge_back: boolean;
  last_message: ApiNudgeLastMessage;
}

export interface ApiNudgeInReplyTo {
  notification_id: string;
  body: string | null;
  voice: boolean;
  image: boolean;
}

export interface ApiNudgeThreadMessage {
  notification_id: string;
  direction: 'sent' | 'received';
  created_at: string;
  body: string | null;
  media_url: string | null;
  media_content_type: string | null;
  voice_url: string | null;
  expires_at: string | null;
  read_at: string | null;
  in_reply_to: ApiNudgeInReplyTo | null;
  reactions: Record<string, { count: number; me: boolean }>;
}

export interface ApiNudgeSuggestion {
  account_id: string;
}

export const apiGetNudgePartners = () =>
  apiRequestGet<{
    accounts: ApiAccountJSON[];
    partners: ApiNudgePartner[];
    pending_count: number;
    grand_total: number;
    total_sent: number;
    total_received: number;
    suggestions: ApiNudgeSuggestion[];
  }>('v1/accounts/nudge_partners');

export const apiGetNudgePendingCount = () =>
  apiRequestGet<{ count: number }>('v1/accounts/nudge_pending_count');

export interface ApiNudgeHistoryItem {
  direction: 'sent' | 'received';
  account_id: string;
  created_at: string;
}

export const apiGetNudgeHistory = () =>
  apiRequestGet<{ accounts: ApiAccountJSON[]; nudges: ApiNudgeHistoryItem[] }>(
    'v1/accounts/nudge_history',
  );

export const apiGetNudgeThread = (id: string) =>
  apiRequestGet<{
    account: ApiAccountJSON;
    messages: ApiNudgeThreadMessage[];
    can_nudge_back: boolean;
    streak: number;
  }>(`v1/accounts/${id}/nudge_thread`);
