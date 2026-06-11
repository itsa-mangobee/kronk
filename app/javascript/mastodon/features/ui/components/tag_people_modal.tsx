import { useState, useCallback, useRef, memo } from 'react';

import { defineMessages, useIntl } from 'react-intl';

import { closeModal } from 'mastodon/actions/modal';
import api from 'mastodon/api';
import type { ApiAccountJSON } from 'mastodon/api_types/accounts';
import { Avatar } from 'mastodon/components/avatar';
import {
  getPendingTags,
  setPendingTags,
} from 'mastodon/features/compose/utils/pending_media_tags';
import type { PendingTag } from 'mastodon/features/compose/utils/pending_media_tags';
import { useAppDispatch } from 'mastodon/store';

const messages = defineMessages({
  title: { id: 'tag_people.title', defaultMessage: 'Tag people' },
  searchPlaceholder: {
    id: 'tag_people.search',
    defaultMessage: 'Search for a person…',
  },
  done: { id: 'tag_people.done', defaultMessage: 'Done' },
  remove: { id: 'tag_people.remove', defaultMessage: 'Remove' },
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
  onRemove: (accountId: string) => void;
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

export const TagPeopleModal: React.FC<{
  mediaId: string;
  previewUrl: string;
}> = ({ mediaId, previewUrl }) => {
  const intl = useIntl();
  const dispatch = useAppDispatch();
  const [tags, setTags] = useState<PendingTag[]>(() => getPendingTags(mediaId));
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<ApiAccountJSON[]>([]);
  const [searching, setSearching] = useState(false);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const handleSelectAccount = useCallback(
    (account: ApiAccountJSON) => {
      if (tags.find((t) => t.accountId === account.id)) return;
      const newTag: PendingTag = {
        accountId: account.id,
        accountName: account.display_name || account.username,
        x: 0.5,
        y: 0.5,
      };
      const next = [...tags, newTag];
      setTags(next);
      setPendingTags(mediaId, next);
      setQuery('');
      setSuggestions([]);
    },
    [tags, mediaId],
  );

  const handleRemoveTag = useCallback(
    (accountId: string) => {
      const next = tags.filter((t) => t.accountId !== accountId);
      setTags(next);
      setPendingTags(mediaId, next);
    },
    [tags, mediaId],
  );

  const handleDone = useCallback(() => {
    dispatch(closeModal({ modalType: 'TAG_PEOPLE', ignoreFocus: false }));
  }, [dispatch]);

  return (
    <div className='modal-root__modal tag-people-modal'>
      <div className='tag-people-modal__header'>
        <h3>{intl.formatMessage(messages.title)}</h3>
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

      {tags.length > 0 && (
        <ul className='tag-people-modal__tag-list'>
          {tags.map((tag) => (
            <li key={tag.accountId}>
              <span>{tag.accountName}</span>
              <RemoveTagButton
                accountId={tag.accountId}
                label={intl.formatMessage(messages.remove)}
                onRemove={handleRemoveTag}
              />
            </li>
          ))}
        </ul>
      )}

      <div className='tag-people-modal__footer'>
        <button type='button' className='button' onClick={handleDone}>
          {intl.formatMessage(messages.done)}
        </button>
      </div>
    </div>
  );
};
