import { type FC, useMemo } from 'react';

import { ERROR_CODE } from '@onekeyfe/react-native-webview/lib/WebViewShared';
import { useIntl } from 'react-intl';

import { Empty, Stack } from '@onekeyhq/components';

import type { MessageDescriptor } from 'react-intl';

interface IErrorViewProps {
  errorCode?: number;
  onRefresh: () => void;
}

const ErrorView: FC<IErrorViewProps> = ({ errorCode, onRefresh }) => {
  const intl = useIntl();
  const messages: {
    title: MessageDescriptor['id'];
    subTitle: MessageDescriptor['id'];
  } = useMemo(() => {
    if (errorCode === ERROR_CODE.CONNECTION_FAILED) {
      return {
        title: 'title__connection_refused',
        subTitle: 'title__connection_refused_desc',
      };
    }
    return {
      title: 'empty__network_issue_connect',
      subTitle: 'empty__network_issue_refresh',
    };
  }, [errorCode]);

  return (
    <Stack flex={1} alignItems="center" justifyContent="center">
      <Empty
        icon="CloudOffOutline"
        title={intl.formatMessage({ id: messages.title })}
        description={intl.formatMessage({ id: messages.subTitle })}
        buttonProps={{
          children: intl.formatMessage({ id: 'action__refresh' }),
          onPress: () => onRefresh?.(),
          testID: 'error-view-refresh',
        }}
      />
    </Stack>
  );
};
export default ErrorView;
