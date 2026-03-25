import React from 'react';
import { Card } from 'antd';
import { useProfileListState } from './useProfileListState';
import { ProfileTable } from './components/ProfileTable';
import { ProfileToolbar } from './components/ProfileToolbar';
import { ProfileModals } from './components/ProfileModals';
import WelcomeScreen from '../../components/WelcomeScreen';
import OnboardingWizard from '../../components/OnboardingWizard';
import { Statistic, Row, Col } from 'antd';
import { PlayCircleOutlined, ReloadOutlined, TagsOutlined, TeamOutlined } from '@ant-design/icons';

const ProfileList: React.FC = () => {
  const state = useProfileListState();
  const {
    profiles,
    onboardingCompleted,
    loading,
    wizardOpen,
    setWizardOpen,
    completeOnboarding,
    setOnboardingCompleted,
    fetchProfiles,
    fetchRuntimes,
    t,
    runningCount,
    groupedCount,
    taggedCount,
    proxiedCount,
  } = state;

  if (profiles.length === 0 && !onboardingCompleted && (!loading || wizardOpen)) {
    return (
      <>
        <WelcomeScreen
          onCreateProfile={() => setWizardOpen(true)}
          onSkip={() => void completeOnboarding()}
        />
        <OnboardingWizard
          open={wizardOpen}
          onFinish={() => {
            setOnboardingCompleted(true);
            setWizardOpen(false);
            void fetchProfiles();
            void fetchRuntimes();
          }}
        />
      </>
    );
  }

  return (
    <div className="p-24">
      <ProfileToolbar state={state} />

      <Row gutter={[16, 16]} className="mb-16">
        <Col xs={24} sm={12} lg={6}>
          <Card className="card-rounded-shadow">
            <Statistic title={t.profile.totalProfiles} value={profiles.length} prefix={<TeamOutlined />} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card className="card-rounded-shadow">
            <Statistic title={t.profile.runningProfiles} value={runningCount} className="text-blue-500" prefix={<PlayCircleOutlined />} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card className="card-rounded-shadow">
            <Statistic title={t.profile.groupedProfiles} value={groupedCount} prefix={<ReloadOutlined />} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card className="card-rounded-shadow">
            <Statistic title={t.profile.taggedProfiles} value={taggedCount} prefix={<TagsOutlined />} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card className="card-rounded-shadow">
            <Statistic title="Có proxy" value={proxiedCount} className="text-cyan-700" />
          </Card>
        </Col>
      </Row>

      <Card className="card-rounded-shadow" bodyStyle={{ paddingBottom: 12 }}>
        <ProfileTable state={state} />
      </Card>

      <ProfileModals state={state} />
    </div>
  );
};

export default ProfileList;
