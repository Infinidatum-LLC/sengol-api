import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkAssessment() {
  try {
    const assessment = await prisma.riskAssessment.findUnique({
      where: { id: 'cmhwff31m0001jsr0agolb283' },
      select: {
        id: true,
        systemDescription: true,
        industry: true,
        riskNotes: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!assessment) {
      console.log('Assessment not found');
      process.exit(1);
    }

    console.log('Assessment ID:', assessment.id);
    console.log('Industry:', assessment.industry);
    console.log('Created:', assessment.createdAt);
    console.log('Updated:', assessment.updatedAt);
    console.log('');

    const riskNotes = assessment.riskNotes as any;

    if (riskNotes?.generatedQuestions) {
      const questions = riskNotes.generatedQuestions;
      console.log('Questions found in riskNotes.generatedQuestions');
      console.log('');
      console.log('Question counts:');
      console.log('  Risk questions:', questions.riskQuestions?.length || 0);
      console.log('  Compliance questions:', questions.complianceQuestions?.length || 0);
      console.log('  Total:', (questions.riskQuestions?.length || 0) + (questions.complianceQuestions?.length || 0));
      console.log('');

      if (questions.incidentSearchCount !== undefined) {
        console.log('Incident Search Count:', questions.incidentSearchCount);
      }

      if (questions.similarIncidentsCount !== undefined) {
        console.log('Similar Incidents Count:', questions.similarIncidentsCount);
      }

      console.log('');
      console.log('Generated at:', questions.generatedAt || 'N/A');
    } else {
      console.log('NO QUESTIONS FOUND');
      console.log('');
      console.log('riskNotes:', JSON.stringify(riskNotes, null, 2).substring(0, 300));
    }

    await prisma.$disconnect();
  } catch (error) {
    console.error('Error:', error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

checkAssessment();
