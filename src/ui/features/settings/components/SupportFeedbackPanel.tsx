import React from 'react';
import { Button, Col, Form, Input, Row, Select, Space, Tag, Typography } from 'antd';
import type { SettingsState } from '../useSettingsState';

interface SupportFeedbackPanelProps {
  state: Pick<
    SettingsState,
    | 't'
    | 'feedbackForm'
    | 'submittingFeedback'
    | 'feedbackLoading'
    | 'feedbackState'
    | 'handleSubmitFeedback'
    | 'fetchFeedback'
    | 'getFeedbackCategoryLabel'
    | 'getFeedbackSentimentLabel'
  >;
}

export const SupportFeedbackPanel: React.FC<SupportFeedbackPanelProps> = ({ state }) => {
  const {
    t,
    feedbackForm,
    submittingFeedback,
    feedbackLoading,
    feedbackState,
    handleSubmitFeedback,
    fetchFeedback,
    getFeedbackCategoryLabel,
    getFeedbackSentimentLabel,
  } = state;

  return (
    <div className="mt-8">
      <Typography.Text strong className="d-block mb-8">
        {t.settings.feedbackInbox}
      </Typography.Text>
      <Form form={feedbackForm} layout="vertical">
        <Row gutter={12}>
          <Col span={8}>
            <Form.Item name="category" label={t.settings.feedbackCategoryLabel} initialValue="feedback" rules={[{ required: true }]}>
              <Select
                options={[
                  { label: t.settings.feedbackCategoryFeedback, value: 'feedback' },
                  { label: t.settings.feedbackCategoryBug, value: 'bug' },
                  { label: t.settings.feedbackCategoryQuestion, value: 'question' },
                ]}
              />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="sentiment" label={t.settings.feedbackSentimentLabel} initialValue="neutral" rules={[{ required: true }]}>
              <Select
                options={[
                  { label: t.settings.feedbackSentimentNeutral, value: 'neutral' },
                  { label: t.settings.feedbackSentimentPositive, value: 'positive' },
                  { label: t.settings.feedbackSentimentNegative, value: 'negative' },
                ]}
              />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="email" label={t.settings.feedbackEmailLabel}>
              <Input placeholder={t.settings.feedbackEmailPlaceholder} />
            </Form.Item>
          </Col>
        </Row>
        <Form.Item
          name="message"
          label={t.settings.feedbackMessageLabel}
          rules={[{ required: true, min: 10, message: t.settings.feedbackMessageMin }]}
        >
          <Input.TextArea rows={4} placeholder={t.settings.feedbackMessagePlaceholder} />
        </Form.Item>
        <Space className="mb-12">
          <Button type="primary" loading={submittingFeedback} onClick={() => void handleSubmitFeedback()}>
            {t.settings.saveFeedback}
          </Button>
          <Button loading={feedbackLoading} onClick={() => void fetchFeedback()}>
            {t.settings.refreshFeedback}
          </Button>
        </Space>
      </Form>

      {feedbackState && feedbackState.entries.length > 0 ? (
        <div className="mb-12">
          {feedbackState.entries.map((entry) => (
            <div key={entry.id} className="mb-10">
              <Tag color={entry.category === 'bug' ? 'error' : entry.category === 'question' ? 'processing' : 'default'}>
                {getFeedbackCategoryLabel(entry.category)}
              </Tag>
              <Tag color={entry.sentiment === 'negative' ? 'error' : entry.sentiment === 'positive' ? 'success' : 'default'}>
                {getFeedbackSentimentLabel(entry.sentiment)}
              </Tag>
              <Typography.Text type="secondary">{new Date(entry.createdAt).toLocaleString()}</Typography.Text>
              <div>
                <Typography.Text>{entry.message}</Typography.Text>
              </div>
              <Typography.Text type="secondary">
                {entry.email ? `${t.settings.feedbackContactPrefix}: ${entry.email}` : t.settings.feedbackNoContactEmail}
                {entry.appVersion ? ` | ${t.settings.feedbackAppPrefix} ${entry.appVersion}` : ''}
              </Typography.Text>
            </div>
          ))}
        </div>
      ) : (
        <Typography.Text type="secondary" className="d-block mb-12">
          {feedbackLoading ? t.settings.loadingFeedback : t.settings.noFeedbackSaved}
        </Typography.Text>
      )}
    </div>
  );
};
