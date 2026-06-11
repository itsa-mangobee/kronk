import { useState, useCallback, useRef, memo, useEffect } from 'react';

import { defineMessages, FormattedMessage, useIntl } from 'react-intl';

import { closeModal } from 'mastodon/actions/modal';
import api from 'mastodon/api';
import {
  apiAddMediaTag,
  apiGetMediaTags,
  apiRemoveMediaTag,
} from 'mastodon/api/media_tags';
import type { ApiAccountJSON } from 'mastodon/api_types/accounts';
import type { ApiMediaTagJSON } from 'mastodon/api_types/media_attachments';
import { Avatar } from 'mastodon/components/avatar';
import { useAppDispatch, useAppSelector } from 'mastodon/store';

const messages = defineMessages({
  title: { id: 'tag_media.title', defaultMessage: 'Tag people' },
  searchPlaceholder: {
    id: 'tag_media.search',
    defaultMessage: 'Search for a person…',
  },
  tagMyself: { id: 'tag_media.tag_myself', defaultMessage: 'Tag myself' },
  remove: { id: 'tag_media.remove', defaultMessage: 'Remove' },
  done: { id: 'tag_media.done', defaultMessage: 'Done' },
  alreadyTagged: {
    id: 'tag_media.already_tagged',
    defaultMessage: 'Already tagged',
  },
});

const SuggestionItem = memo<{
  account: ApiAccountJSON;
  onSelect: (account: ApiAccountJSON) => void;
}>(({ account, onSelect }) => {
  const handleClick = useCallback(() => {
    onSelect(account);
  }, [account, onSelect]);
  return (
    <button
      type='button'
      className='tag-people-modal__suggestion-btn'
      onClick={handleClick}
    >
      <Avatar account={account as never} size={24} />
      <span>{account.display_name || account.username}</span>
      <span className='tag-people-modal__acct'>@{account.acct}</span>
    </button>
  );
});
SuggestionItem.displayName = 'SuggestionItem';

const RemoveTagButton = memo<{
  accountId: string;
  label: string;
  onRemove: (id: string) => void;
}>(({ accountId, label, onRemove }) => {
  const handleClick = useCallback(() => {
    onRemove(accountId);
  }, [accountId, onRemove]);
  return (
    <button
      type='button'
      className='tag-people-modal__remove-btn'
      onClick={handleClick}
      aria-label={label}
    >
      ×
    </button>
  );
});
RemoveTagButton.displayName = 'RemoveTagButton';

export const SelfTagModal: React.FC<{
  mediaId: string;
  previewUrl: string;
}> = ({ mediaId, previewUrl }) => {
  const intl = useIntl();
  const dispatch = useAppDispatch();
  const myId = useAppSelector((state) => state.meta.get('me') as string);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [existingTags, setExistingTags] = useState<ApiMediaTagJSON[]>([]);
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<ApiAccountJSON[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGetMediaTags(mediaId)
      .then(setExistingTags)
      .catch(() => undefined);
  }, [mediaId]);

  const close = useCallback(() => {
    dispatch(closeModal({ modalType: 'SELF_TAG', ignoreFocus: false }));
  }, [dispatch]);

  const handleQueryChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setQuery(value);
      if (searchTimeout.current) clearTimeout(searchTimeout.current);
      if (value.trim().length < 2) {
        setSuggestions([]);
        return;
      }
      setSearching(true);
      searchTimeout.current = setTimeout(() => {
        void api()
          .get<ApiAccountJSON[]>('/api/v1/accounts/search', {
            params: { q: value, limit: 5 },
          })
          .then((r) => {
            setSuggestions(r.data);
            setSearching(false);
          })
          .catch(() => {
            setSearching(false);
          });
      }, 300);
    },
    [],
  );

  const addTag = useCallback(
    (accountId: string) => {
      if (existingTags.some((t) => t.account_id === accountId)) {
        setError(intl.formatMessage(messages.alreadyTagged));
        return;
      }
      apiAddMediaTag(mediaId, accountId, 0.5, 0.5)
        .then((tag) => {
          setExistingTags((prev) => [...prev, tag]);
          setQuery('');
          setSuggestions([]);
          setError(null);
        })
        .catch((err: unknown) => {
          const msg = (err as { response?: { data?: { error?: string } } })
            .response?.data?.error;
          setError(msg ?? 'Could not add tag');
        });
    },
    [existingTags, mediaId, intl],
  );

  const handleSelectAccount = useCallback(
    (account: ApiAccountJSON) => {
      addTag(account.id);
    },
    [addTag],
  );

  const handleTagMyself = useCallback(() => {
    if (myId) addTag(myId);
  }, [myId, addTag]);

  const handleRemoveTag = useCallback(
    (accountId: string) => {
      apiRemoveMediaTag(mediaId, accountId)
        .then(() => {
          setExistingTags((prev) =>
            prev.filter((t) => t.account_id !== accountId),
          );
          setError(null);
        })
        .catch((err: unknown) => {
          const status = (err as { response?: { status?: number } }).response
            ?.status;
          setError(
            status === 403
              ? 'You can only remove your own tag'
              : 'Could not remove tag',
          );
        });
    },
    [mediaId],
  );

  return (
    <div className='modal-root__modal tag-people-modal'>
      <div className='tag-people-modal__header'>
        <h3>{intl.formatMessage(messages.title)}</h3>
        {myId && (
          <button
            type='button'
            className='tag-people-modal__tag-myself-btn'
            onClick={handleTagMyself}
          >
            <FormattedMessage
              id='tag_media.tag_myself'
              defaultMessage='Tag myself'
            />
          </button>
        )}
      </div>

      <div className='tag-people-modal__image-wrapper'>
        <img
          src={previewUrl}
          alt=''
          draggable={false}
          className='tag-people-modal__preview'
        />
      </div>

      <div className='tag-people-modal__search'>
        <input
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus
          type='text'
          value={query}
          onChange={handleQueryChange}
          placeholder={intl.formatMessage(messages.searchPlaceholder)}
          className='tag-people-modal__search-input'
        />
        {searching && <div className='tag-people-modal__search-loading' />}
        {suggestions.length > 0 && (
          <ul className='tag-people-modal__suggestions'>
            {suggestions.map((acct) => (
              <li key={acct.id}>
                <SuggestionItem account={acct} onSelect={handleSelectAccount} />
              </li>
            ))}
          </ul>
        )}
      </div>

      {error && <p className='tag-people-modal__error'>{error}</p>}

      {existingTags.length > 0 && (
        <ul className='tag-people-modal__tag-list'>
          {existingTags.map((tag) => (
            <li key={tag.account_id}>
              <span>
                {tag.account?.display_name ??
                  tag.account?.username ??
                  tag.account_id}
              </span>
              <RemoveTagButton
                accountId={tag.account_id}
                label={intl.formatMessage(messages.remove)}
                onRemove={handleRemoveTag}
              />
            </li>
          ))}
        </ul>
      )}

      <div className='tag-people-modal__footer'>
        <button type='button' className='button' onClick={close}>
          {intl.formatMessage(messages.done)}
        </button>
      </div>
    </div>
  );
};
