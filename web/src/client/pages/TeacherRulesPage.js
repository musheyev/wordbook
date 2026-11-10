import React from 'react';
import { Link } from 'react-router-dom';
import { site } from '../utils/site';
import { ComputerOnly } from '../utils/computerOnly';

// The teacher rules (/teacher/rules), which everyone agrees to when asking
// to become a teacher (TeacherPage). On a computer, like the other teacher
// tools. Plain words, like the Privacy and Support pages; it uses the same
// layout (.legal-page).
const UPDATED = 'November 10, 2026';

export default function TeacherRulesPage() {
    const mail = <a href={`mailto:${site.email}`}>{site.email}</a>;
    return (
        <ComputerOnly>
            <article className="legal-page">
                <h1>Teacher rules</h1>
                <p className="legal-page__updated">Last updated {UPDATED}</p>

                <p>
                    Teachers on {site.name} share notes, words and wordbooks with their students in classrooms. To keep
                    it a good place to learn, every teacher agrees to these rules.
                </p>

                <h2>Who you invite</h2>
                <ul>
                    <li>Invite only people you teach, or who asked to join your class.</li>
                    <li>Don’t use invitations to advertise, or send them to people you don’t know.</li>
                </ul>

                <h2>What you share</h2>
                <ul>
                    <li>You’re responsible for what you share with your students.</li>
                    <li>Share only what you wrote yourself or have the right to share.</li>
                    <li>Nothing hateful, sexual, violent, or otherwise harmful, and nothing illegal.</li>
                </ul>

                <h2>Your students</h2>
                <ul>
                    <li>Students see the name you chose to show them; they don’t see your email address.</li>
                    <li>Students see each other’s usernames, never each other’s email addresses.</li>
                    <li>Don’t collect your students’ personal information through the app.</li>
                </ul>

                <h2>If the rules are broken</h2>
                <p>
                    We may turn a teacher account off. Its classrooms then close: students no longer see them, and
                    the copies they saved to their own notebooks stay theirs.
                </p>

                <h2>Questions</h2>
                <p>
                    Write to {mail}. See also our <Link to="/privacy">privacy policy</Link>.
                </p>
            </article>
        </ComputerOnly>
    );
}
