import { request } from "@octokit/request";
import { json, Request, Router } from "express";
import Cookies from "universal-cookie";
import cookiesMiddleware from "universal-cookie-express";
import { COOKIE_NAME_PORTAL_TOKEN } from "../auth";
import { dbConnect } from "../db/utils";

const router = Router();

async function getGitHubLogin(req: Request) {
	const cookies = (req as any)["universalCookies"] as Cookies;
	const ghToken = cookies.get(COOKIE_NAME_PORTAL_TOKEN);
	if (!ghToken) {
		return undefined;
	}

	const requestWithAuth = request.defaults({
		headers: {
			authorization: `token ${ghToken}`,
		},
	});

	const user = await requestWithAuth("GET /user");
	return user.data.login;
}

router.get("/api/user/", cookiesMiddleware(), async function (req, res) {
	try {
		const [db, login] = await Promise.all([
			dbConnect(),
			getGitHubLogin(req),
		]);
		const users = db.users();

		if (!login) {
			res.status(403).send("Not logged in");
			return;
		}

		let user = await users.findOne({ login });
		if (!user) {
			const inserted = await users.insertOne({
				login,
				watches: [],
			});
			user = inserted.ops[0];
		}

		// we don't want to return the _id field (which is returned even if the signature doesn't say so)
		delete (user as any)._id;
		res.send(user);
	} catch (error) {
		console.error(error);
		res.status(500).send(error.message || error);
	}
});

router.put(
	"/api/user/",
	json(),
	cookiesMiddleware(),
	async function (req, res) {
		try {
			const [db, login] = await Promise.all([
				dbConnect(),
				getGitHubLogin(req),
			]);
			const users = db.users();

			if (!login) {
				res.status(403).send("Not logged in");
				return;
			}

			const user = { ...req.body };
			delete user.login;
			const result = await users.findOneAndUpdate(
				{ login },
				{ $set: user },
				{ upsert: true },
			);
			res.send(result.value);
		} catch (error) {
			console.error(error);
			res.status(500).send(error.message || error);
		}
	},
);

export default router;
